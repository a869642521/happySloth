# 卡片叠层助手

这是一个 Chrome 扩展原型：粘贴视频或网页链接，点击网页里的任意卡片区域，就能把播放器或网页叠层贴到同样的位置和尺寸上。

扩展目前包含三种模式：

- `视频`：适合 mp4/webm 直链，以及 YouTube、Vimeo、Bilibili 等可嵌入播放器。
- `网页`：把整个网站作为 iframe 放进卡片里。允许嵌入的网站可以在卡片里浏览；禁止 iframe 嵌入的网站需要点“打开”跳转原站。
- `投屏`：把手机投屏服务提供的浏览器可访问地址放进卡片里，支持 MJPEG、常见视频直链，以及 WebRTC viewer 页面。
  如果投屏地址所在的本地服务提供 `/tap` 和 `/swipe` 接口，扩展会把卡片里的点击/拖动发送给它，从而可以转成手机触控。

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
- 投屏地址：MJPEG 图片流、常见视频流地址，或本地 WebRTC viewer 页面，例如 `http://localhost:8080/stream.mjpeg`。
- 投屏控制：默认把控制请求发送到投屏地址的同源服务，例如 `http://localhost:8080/tap` 和 `http://localhost:8080/swipe`。如果画面和控制服务不在同一个端口，可以在地址 hash 里指定控制服务：`http://localhost:8080/stream.mjpeg#control=http://localhost:4174`。
- YouTube 链接会转换为 embed 地址。
- Vimeo 链接会转换为 embed 地址。
- Bilibili 的 `BV...` 和 `av...` 视频页会转换为 `player.bilibili.com` 播放器。
- 其他网页链接会尝试用 iframe 打开，但可能被目标网站的嵌入策略阻止。

Bilibili 可以使用完整链接，例如：

```text
https://www.bilibili.com/video/BV...
```

裸域名也会自动补全，例如 `www.bilibili.com/video/BV...` 会按 `https://www.bilibili.com/video/BV...` 处理。`https://b23.tv/...` 这类短链暂时不会解析。

## Android 投屏控制

扩展本身只能在网页里显示投屏画面；如果要“点卡片 = 点手机”，还需要一个本地控制服务把点击转给 Android。项目里提供了一个最小 ADB 控制服务：

```powershell
node adb-control-server.mjs
```

不接手机时可以先用干跑模式验证扩展请求是否能到达本地服务：

```powershell
$env:DRY_RUN="1"; $env:DEVICE_SIZE="1080x2400"; node adb-control-server.mjs
```

准备工作：

1. 电脑安装 Android Platform Tools，并确保 `adb` 在 PATH 里。
2. 手机打开 USB 调试，连接电脑并完成授权。
3. 运行 `adb devices` 能看到设备。
4. 启动投屏画面服务，例如 MJPEG、WebRTC 或 scrcpy 相关 viewer。
5. 在扩展里选择 `投屏`，填入类似 `http://localhost:8080/stream.mjpeg#control=http://localhost:4174` 的地址。

控制接口格式：

- `POST http://localhost:4174/tap`：扩展发送 `{ "x": 0.5, "y": 0.5 }`，服务会转成 `adb shell input tap`。
- `POST http://localhost:4174/swipe`：扩展发送起点、终点和时长，服务会转成 `adb shell input swipe`。

如果只有投屏画面，没有本地控制服务，卡片仍然能显示画面，但不能操作手机。

## 注意

- 直链视频默认静音自动播放，成功率更高。
- 浏览器内部页面和 Chrome Web Store 不能被扩展修改。
- 保存位置依赖当前网页 DOM，网站结构变化后可能需要重新选择卡片。
