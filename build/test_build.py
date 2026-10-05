"""Exercise scanning, output fidelity, exclusions, and rebuild safeguards."""

import json
from pathlib import Path
import tempfile
import unittest

from build import build, MARKER, TEXT_LIMIT


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def write(self, relative, value):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(value if isinstance(value, bytes) else value.encode("utf-8"))
        return path

    def test_recursive_unicode_empty_folders_and_original_bytes(self):
        self.write("根文件", "没有后缀的文字")
        self.write("故事/下一层/名字 # & %.txt", "中文\r\n第二行")
        self.write("二进制.dat", b"\x00\xff\x11\x12")
        self.write("图片.jpg", b"\xff\xd8\x00\xff")
        (self.root / "故事/空目录").mkdir()
        output, manifest, _ = build(self.root, "测试档案", [])
        records = {entry["path"]: entry for entry in manifest["files"]}
        self.assertEqual(len(records), 4)
        self.assertIn("故事/下一层", manifest["directories"])
        self.assertIn("故事/空目录", manifest["directories"])
        self.assertEqual(records["根文件"]["text"], "没有后缀的文字")
        self.assertEqual(records["二进制.dat"]["kind"], "file")
        self.assertEqual(records["图片.jpg"]["kind"], "image")
        self.assertIn("%23%20%26%20%25.txt", records["故事/下一层/名字 # & %.txt"]["url"])
        for relative in records:
            self.assertEqual((self.root / relative).read_bytes(), (output / "files" / relative).read_bytes())
        serialized = (output / "manifest.js").read_text(encoding="utf-8")
        self.assertEqual(json.loads(serialized.removeprefix("window.ARCHIVE_DATA = ").removesuffix(";\n")), manifest)

    def test_excludes_at_all_depths_and_custom_globs(self):
        for name in [".env", ".env.local", ".gitignore", ".git/config", "build/app.py", "static/photo.png", "nested/dist/index.html", "nested/build/a", "nested/.env", "node_modules/lib/code.js", "secret.pem", "nested/logs/debug.log", "private/memo", "drafts/nested/memo"]:
            self.write(name, "exclude me")
        self.write("nested/keep", "keep me")
        _, manifest, _ = build(self.root, "Archive", ["*.log", "private", "drafts/*"])
        self.assertEqual([entry["path"] for entry in manifest["files"]], ["nested/keep"])

    def test_rebuild_removes_stale_files_and_never_scans_output(self):
        old = self.write("old.txt", "old")
        output, _, _ = build(self.root, "Archive", [])
        old.unlink()
        self.write("new.txt", "new")
        _, manifest, _ = build(self.root, "Archive", [])
        self.assertEqual([entry["path"] for entry in manifest["files"]], ["new.txt"])
        self.assertFalse((output / "files/old.txt").exists())
        self.assertTrue((output / MARKER).is_file())
        self.assertFalse(list(self.root.glob(".archive-build-*")))

    def test_static_assets_ship_without_entering_the_collection(self):
        self.write("keep.txt", "archive content")
        image = self.write("static/dead.jpg", b"\xff\xd8\xffexample")
        self.write("static/nested/style.css", "body {}")
        self.write("static/.env", "secret")
        self.write("static/nested/private.key", "secret")
        output, manifest, _ = build(self.root, "Archive", [])
        self.assertEqual([entry["path"] for entry in manifest["files"]], ["keep.txt"])
        self.assertNotIn("static", manifest["directories"])
        self.assertEqual((output / "assets/dead.jpg").read_bytes(), image.read_bytes())
        self.assertTrue((output / "assets/nested/style.css").is_file())
        self.assertFalse((output / "assets/.env").exists())
        self.assertFalse((output / "assets/nested/private.key").exists())

    def test_unowned_dist_is_preserved(self):
        original = self.write("dist/important.txt", "do not replace")
        with self.assertRaises(ValueError):
            build(self.root, "Archive", [])
        self.assertEqual(original.read_text(), "do not replace")

    def test_html_title_and_text_are_not_inserted_as_markup(self):
        content = '<script>alert("unsafe")</script>'
        self.write("example.html", content)
        output, manifest, _ = build(self.root, "<unsafe & title>", [])
        index = (output / "index.html").read_text(encoding="utf-8")
        self.assertIn("&lt;unsafe &amp; title&gt;", index)
        self.assertNotIn("<unsafe & title>", index)
        self.assertEqual(manifest["files"][0]["text"], content)

    def test_large_text_is_downloadable_and_empty_repo_builds(self):
        output, manifest, _ = build(self.root, "Empty", [])
        self.assertEqual(manifest["files"], [])
        self.assertTrue((output / "files").is_dir())
        self.write("large.txt", b"a" * (TEXT_LIMIT + 1))
        _, manifest, _ = build(self.root, "Archive", [])
        self.assertEqual(manifest["files"][0]["kind"], "file")
        self.assertEqual((output / "files/large.txt").stat().st_size, TEXT_LIMIT + 1)

    def test_gb18030_and_zero_byte_text(self):
        self.write("旧文本", "旧编码的中文".encode("gb18030"))
        self.write("empty.txt", b"")
        _, manifest, _ = build(self.root, "Archive", [])
        records = {entry["path"]: entry for entry in manifest["files"]}
        self.assertEqual(records["旧文本"]["text"], "旧编码的中文")
        self.assertEqual(records["empty.txt"]["text"], "")
        self.assertEqual(records["empty.txt"]["kind"], "text")

    def test_external_symlink_is_skipped(self):
        with tempfile.TemporaryDirectory() as outside:
            secret = Path(outside) / "outside.txt"
            secret.write_text("outside")
            try:
                (self.root / "linked.txt").symlink_to(secret)
                (self.root / "cycle").symlink_to(self.root, target_is_directory=True)
            except OSError as error:
                self.skipTest(f"Symlink creation unavailable: {error}")
            _, manifest, skipped = build(self.root, "Archive", [])
            self.assertEqual(manifest["files"], [])
            self.assertEqual(set(skipped), {"linked.txt", "cycle"})


if __name__ == "__main__":
    unittest.main()
