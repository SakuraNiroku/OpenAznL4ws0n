# 静态档案网页构建器

需要 Python 3.9 或更新版本，无第三方依赖。仓库根目录运行：

```sh
python build/build.py
```

构建后打开 `dist/index.html` 即可浏览，也可以把整个 `dist/` 部署到 GitHub Pages、Nginx 或其他静态托管服务。页面不依赖 CDN、网络字体或后端，在 `file://` 下也支持目录、全文搜索和预览。本地浏览时可在新标签打开原文件；通过 HTTP(S) 浏览时提供下载按钮。

## 可选参数

```sh
python build/build.py --title "我的档案馆"
python build/build.py --exclude "*.log" --exclude "private" --exclude "notes/drafts/*"
python build/build.py --root "D:/another-repo" --title "另一个档案馆"
```

`--exclude` 可以重复，使用 glob 匹配仓库相对路径（统一用 `/`）或任意一级的名称。`--root` 默认为本脚本所在 `build/` 的父目录，不受命令执行位置影响；输出始终放在选定根目录的 `dist/`。修改仓库内容后重新运行即可更新网页，已删除文件也会从输出中消失。

## 收录规则

- 自动递归遍历所有文件夹，保留空目录以及无扩展名文件。
- 默认排除任何层级的 `build`、`static`、`dist`、`node_modules`、`vendor`、`__pycache__`、`venv`、`env`、`coverage`、`target`。
- 默认排除以 `.` 开头的文件和目录，包括 `.git`、`.gitignore`、`.env`、`.env.local`、`.github`、`.venv` 等。
- 排除 `Thumbs.db`、`Desktop.ini`、以 `~` 结尾的备份文件，以及 `.pyc`、`.pyo`、`.pem`、`.key`、`.p12`、`.pfx` 文件。
- 跳过符号链接和 Windows 目录联接，避免递归循环及引用仓库外的文件。跳过的路径会在构建完成时显示。

原始文件完整复制到 `dist/files/`，保留相对目录和原始字节；根目录、中文名称和特殊字符名称都受支持。生成的 `manifest.js` 包含目录、文件元数据和小型文本的内容。

`static/` 中的页面资源另行复制到 `dist/assets/`，不进入馆藏列表或统计。资源复制同样跳过隐藏文件、密钥、缓存和符号链接。首页的百合图片保存在 `static/dead.jpg`，构建后通过本地路径加载，无需访问原图片服务器。

首页支持献花：每次点击献上一束花，显示轻微的花朵动画及个人献花次数。次数保存在当前浏览器的 `localStorage`，刷新后保留；这不是所有访客共享的统计。浏览器禁止存储时仍可在当次访问中使用，开启减少动态效果偏好时不播放动画。

文字预览支持不超过 256 KiB 的 UTF-8 / GB18030 文本，包括没有后缀的文件；Markdown 支持标题、段落、无序列表、引用、代码块、加粗和 HTTP(S) 链接。文字与 HTML 源码按文本处理。图片可直接预览，常见音视频可通过浏览器播放器查看，其他类型及超出预览限制的文件通过原文件入口查看或下载。

“全部馆藏”仅展示仓库内的所有文件；通过左侧目录导航进入文件夹后，展示该目录的直接文件和子文件夹。全文搜索跨全站的文件路径与可预览文本，类型筛选展示当前目录及其子目录中的匹配文件。桌面和手机均支持目录导航、卡片 / 列表视图，以及 Esc 关闭预览。

构建先写入临时目录，全部成功后才替换旧输出。本构建器用 `dist/.archive-builder` 标记输出归属；已有 `dist/` 没有匹配标记时会拒绝覆盖，需先移走原目录。`dist/` 已加入仓库的 `.gitignore`。

## 修改外观与验证

页面模板在 `build/site/index.html`，样式在 `build/site/style.css`，交互在 `build/site/app.js`。修改后重新构建即可。构建器验证命令：

```sh
python -m unittest discover -s build -p "test_*.py" -v
```
