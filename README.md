# 卡片叠层助手

这是一个 Chrome 扩展原型：粘贴视频或网页链接，点击网页里的任意卡片区域，就能把播放器或网页叠层贴到同样的位置和尺寸上。

扩展目前包含两种模式：

- `视频`：适合 mp4/webm 直链，以及 YouTube、Vimeo、Bilibili 等可嵌入播放器。
- `网页`：把整个网站作为 iframe 放进卡片里。允许嵌入的网站可以在卡片里浏览；禁止 iframe 嵌入的网站需要点“打开”跳转原站。

网页模式中，如果卡片里的网站点击到了可识别的视频链接，扩展会拦截跳转，并把当前卡片切换成视频播放器。当前支持 Bilibili BV/av、YouTube、Vimeo 和常见视频直链。

## 加载扩展

1. 打开 `chrome://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择当前项目文件夹。
5. 打开普通网页，点击扩展图标，粘贴链接，然后选择卡片。

网页模式里可以选择 `自适应` 或 `移动端`。移动端会把 iframe 固定成手机视口，并对 Bilibili 等已知站点尝试切到移动域名。

## 本地演示

项目包含 `demo.html`。加载扩展后，在当前目录运行：

```powershell
node server.mjs
```

然后访问：

```text
http://localhost:4173/demo.html
```

可用这个直链测试视频模式：

```text
https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4
```

## 支持链接

- 直链视频：`.mp4`、`.webm`、`.ogg`、`.ogv`、`.mov`。
- YouTube 链接会转换为 embed 地址。
- Vimeo 链接会转换为 embed 地址。
- Bilibili 的 `BV...` 和 `av...` 视频页会转换为 `player.bilibili.com` 播放器。
- 其他网页链接会尝试用 iframe 打开，但可能被目标网站的嵌入策略阻止。

Bilibili 可以使用完整链接，例如：

```text
https://www.bilibili.com/video/BV...
```

裸域名也会自动补全，例如 `www.bilibili.com/video/BV...` 会按 `https://www.bilibili.com/video/BV...` 处理。`https://b23.tv/...` 这类短链暂时不会解析。

## 注意

- 直链视频默认静音自动播放，成功率更高。
- 浏览器内部页面和 Chrome Web Store 不能被扩展修改。
- 保存位置依赖当前网页 DOM，网站结构变化后可能需要重新选择卡片。
