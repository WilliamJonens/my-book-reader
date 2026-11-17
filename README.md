<div align="center">

# my-book 阅读器

**办公摸鱼神器**

本地 TXT 小说阅读 · 知乎浏览 · 贴吧浏览 · **毫秒级隐藏！**

<img src="build/icon.png" alt="my-book 阅读器图标" width="144" height="144">

[下载 Windows 10 x64 安装包](https://github.com/WilliamJonens/my-book-reader/releases/latest) · [查看使用说明](docs/使用说明.md)

</div>

## 功能一览

| 板块 | 可以做什么 |
| --- | --- |
| TXT 小说 | 打开本地 TXT，自动识别编码、滚动或按键翻页，并记住阅读位置。 |
| 知乎 | 浏览推荐内容，展开全文、图片、视频、评论和二级评论；点击图片可放大查看，在知乎板块设置 Cookie。 |
| 贴吧 | 按吧名浏览热门或最新帖子，查看图片、楼层和楼中楼；点击图片可放大查看，最近访问的吧名可直接打开。 |

**摸鱼操作：**鼠标移出后隐去内容、老板键隐藏窗口、透明背景、隐藏工具栏和滚动条。窗口大小调整后自动保存，在各板块间共用。详细操作见[使用说明](docs/使用说明.md)。

> 目前仅提供 Windows 10 x64 版本。

## 版本更新

### [v1.3.0](https://github.com/WilliamJonens/my-book-reader/releases/tag/v1.3.0) · 评论、时间与图片查看

- 修复知乎 Cookie 已设置仍误报过期、评论数不为零却显示空评论的问题；评论作者显示用户名。
- 知乎问答、评论和回复，以及贴吧帖子、楼层和楼中楼增加年月日时分秒时间提示。
- 知乎与贴吧图片可点击放大、滚轮缩放和拖动查看；贴吧配图优先加载原图供查看。

### [v1.2.0](https://github.com/WilliamJonens/my-book-reader/releases/tag/v1.2.0) · TXT、知乎、贴吧

- 增加主菜单，启动时选择阅读板块；进入板块后可通过右键返回主菜单。
- 增加知乎推荐流、全文、图文视频、评论及二级评论浏览；Cookie 可在知乎设置中保存和更改，并提示过期。
- 增加贴吧最近吧名、热门与最新排序、帖子图片、楼层和楼中楼；返回列表时恢复原滚动位置。
- 窗口大小调整后立即保存；优化知乎排版，以及贴吧图片和表情的加载。

### [v1.1.0](https://github.com/WilliamJonens/my-book-reader/releases/tag/v1.1.0) · 阅读体验修复

- 修复更换 TXT 文件后，“鼠标移出后隐去内容”偶尔失效的问题。
- 关闭阅读器时保存窗口尺寸，下次启动恢复。

### [v1.0.0](https://github.com/WilliamJonens/my-book-reader/releases/tag/v1.0.0) · 首个版本

- 支持本地 TXT 阅读、编码识别和切换、滚动与自定义按键翻页、阅读进度记忆。
- 支持透明背景、字体与窗口尺寸调整、隐藏工具栏和滚动条。
- 提供鼠标移出隐去内容、老板键，以及在隐去关闭时使用的自动滚动。

更多细节见 [CHANGELOG.md](CHANGELOG.md)。

## 本地运行与打包

需要 Node.js 和 pnpm。在项目根目录运行：

~~~powershell
pnpm install
pnpm dev
~~~

在 Windows 环境生成安装包：

~~~powershell
pnpm build:win
~~~

安装包输出到 `dist` 目录；`dist`、`out` 和 `node_modules` 不纳入源码仓库。开发与打包细节见[开发说明](docs/开发说明.md)。

## 隐私

TXT 正文只从用户选择的本地文件读取，不上传小说内容。应用在本机保存设置、最近打开的文件路径、阅读进度、最近访问的吧名及用户输入的知乎 Cookie；Cookie 使用系统加密服务保存。知乎和贴吧内容由对应网站提供。
