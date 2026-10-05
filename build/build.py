#!/usr/bin/env python3
"""Build an offline repository archive using only the Python standard library."""

import argparse
import fnmatch
import html
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
from urllib.parse import quote

DEFAULT_EXCLUDES = {
    "build", "static", "dist", "node_modules", "vendor", "__pycache__",
    "venv", "env", "coverage", "target", "Thumbs.db", "Desktop.ini",
}
EXCLUDED_SUFFIXES = {".pyc", ".pyo", ".pem", ".key", ".p12", ".pfx"}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".svg", ".ico"}
TEXT_LIMIT = 256 * 1024
MARKER = ".archive-builder"
MARKER_VALUE = "repository-static-archive-v1\n"
TEMPLATE_DIR = Path(__file__).resolve().parent / "site"


def is_link(path):
    # Windows junctions are reparse points, even on Python before 3.12.
    return path.is_symlink() or bool(
        getattr(path.lstat(), "st_file_attributes", 0)
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def excluded(path, patterns):
    """Apply component globs as well as repository-relative path globs."""
    if any(part.startswith(".") or part in DEFAULT_EXCLUDES for part in path.parts):
        return True
    if path.suffix.lower() in EXCLUDED_SUFFIXES or path.name.endswith("~"):
        return True
    relative = path.as_posix()
    return any(
        fnmatch.fnmatchcase(relative, pattern)
        or any(fnmatch.fnmatchcase(part, pattern) for part in path.parts)
        for pattern in patterns
    )


def preview_text(path):
    if path.stat().st_size > TEXT_LIMIT:
        return None
    raw = path.read_bytes()
    if b"\0" in raw:
        return None
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            value = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
            return None
        return value
    return None


def collect(root, destination, patterns):
    files, directories, skipped = [], [], []

    def visit(folder):
        relative_folder = folder.relative_to(root)
        if relative_folder.parts:
            directories.append(relative_folder.as_posix())
        with os.scandir(folder) as entries:
            children = sorted(entries, key=lambda entry: (not entry.is_dir(follow_symlinks=False), entry.name.casefold()))
        for entry in children:
            source = Path(entry.path)
            relative = source.relative_to(root)
            if excluded(relative, patterns):
                continue
            # Junctions and symlinks can lead outside the repository or into cycles.
            if is_link(source):
                skipped.append(relative.as_posix())
                continue
            if entry.is_dir(follow_symlinks=False):
                visit(source)
            elif entry.is_file(follow_symlinks=False):
                target = destination / "files" / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
                suffix = source.suffix.lower()
                text = None if suffix in IMAGE_SUFFIXES else preview_text(target)
                kind = "image" if suffix in IMAGE_SUFFIXES else "text" if text is not None else "file"
                record = {
                    "path": relative.as_posix(), "name": source.name,
                    "parent": relative.parent.as_posix() if relative.parent.parts else "",
                    "url": "files/" + quote(relative.as_posix(), safe="/"),
                    "size": target.stat().st_size, "kind": kind,
                }
                if text is not None:
                    record["text"] = text
                files.append(record)

    visit(root)
    return files, directories, skipped


def copy_static_assets(root, destination, patterns):
    """Keep presentation assets out of the archive, but ship them with the site."""
    assets = root / "static"
    skipped = []
    if assets.is_symlink() or (assets.exists() and is_link(assets)):
        return ["static"]
    if not assets.exists():
        return skipped
    if not assets.is_dir():
        raise ValueError("static 必须是目录。")

    def visit(folder):
        with os.scandir(folder) as entries:
            for entry in entries:
                source = Path(entry.path)
                relative = source.relative_to(assets)
                if excluded(relative, patterns):
                    continue
                if is_link(source):
                    skipped.append("static/" + relative.as_posix())
                elif entry.is_dir(follow_symlinks=False):
                    visit(source)
                elif entry.is_file(follow_symlinks=False):
                    target = destination / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(source, target)

    visit(assets)
    return skipped


def build(root, title, patterns):
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("仓库根路径必须是目录。")
    output = root / "dist"
    if (output.exists() and is_link(output)) or output.is_symlink():
        raise ValueError("dist 不能是符号链接或目录联接。")
    if output.exists() and (
        not output.is_dir() or not (output / MARKER).is_file()
        or (output / MARKER).read_text(encoding="utf-8") != MARKER_VALUE
    ):
        raise ValueError("现有 dist 不是本构建器生成的目录；请先将它移到其他位置。")
    with tempfile.TemporaryDirectory(prefix=".archive-build-", dir=root) as temporary:
        staged = Path(temporary) / "site"
        staged.mkdir()
        (staged / "files").mkdir()
        files, directories, skipped = collect(root, staged, patterns)
        skipped.extend(copy_static_assets(root, staged / "assets", patterns))
        manifest = {
            "title": title, "repository": root.name,
            "files": files, "directories": directories,
            "totalBytes": sum(record["size"] for record in files),
        }
        # Local JS data also works under file://; no fetch or server is required.
        data = json.dumps(manifest, ensure_ascii=True, separators=(",", ":"))
        (staged / "manifest.js").write_text("window.ARCHIVE_DATA = " + data + ";\n", encoding="utf-8")
        index = (TEMPLATE_DIR / "index.html").read_text(encoding="utf-8")
        (staged / "index.html").write_text(index.replace("{{TITLE}}", html.escape(title)), encoding="utf-8")
        for asset in ("style.css", "app.js"):
            shutil.copy2(TEMPLATE_DIR / asset, staged / asset)
        (staged / MARKER).write_text(MARKER_VALUE, encoding="utf-8")
        # Finish scanning and writing before replacing the last successful build.
        backup = Path(temporary) / "previous"
        if output.exists():
            output.rename(backup)
        try:
            staged.rename(output)
        except OSError:
            if backup.exists():
                backup.rename(output)
            raise
    return output, manifest, skipped


def main():
    parser = argparse.ArgumentParser(description="递归收集仓库内容，生成离线静态档案网页到 dist/。")
    parser.add_argument("--root", type=Path, default=TEMPLATE_DIR.parent.parent, help="仓库根目录，默认是 build/ 的父目录")
    parser.add_argument("--title", default="aznL4ws0n 档案馆", help="网页标题")
    parser.add_argument("--exclude", action="append", default=[], metavar="GLOB", help="追加排除规则，可重复，如 --exclude '*.log' --exclude 'private/*'")
    args = parser.parse_args()
    try:
        output, manifest, skipped = build(args.root, args.title, args.exclude)
    except (OSError, ValueError) as error:
        parser.exit(1, f"构建失败：{error}\n")
    print(f"已生成 {output / 'index.html'}")
    print(f"收录 {len(manifest['files'])} 个文件、{len(manifest['directories'])} 个目录。")
    if skipped:
        print("已跳过符号链接 / 目录联接：" + ", ".join(skipped))


if __name__ == "__main__":
    main()
