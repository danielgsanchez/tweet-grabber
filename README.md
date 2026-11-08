# Tweet Grabber

A small Chrome extension for saving photos, videos and GIFs from X (Twitter).

- **Hover** over a photo, video or GIF and click the button at the top center. In a post with several photos, it saves the one under the pointer.
- **Quality:** videos and GIFs are saved as the highest-quality MP4 X offers, and photos at their original size.
- **File names:** by default, `username_IMGGxK3fVbWQAAr1Zq.jpg` for photos and `username_VID<name>.mp4` for videos, using the file's name on X. Click the extension's icon to change the prefix, suffix and name (file name, post number or custom), or to leave out the username or the IMG / VID tag.

## Install

1. Download [tweet-grabber.zip](https://github.com/danielgsanchez/tweet-grabber/releases/latest/download/tweet-grabber.zip) and unzip it somewhere you'll keep it, because Chrome loads the extension from that folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the `tweet-grabber` folder.
4. Reload any open X tab.

To update, replace the folder with the one from the latest ZIP, click the reload icon on the extension's card and reload X.

## Install as a userscript

1. Install a script manager such as [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/). Greasemonkey is not supported. In Chrome, the manager may ask you to turn on Developer mode or allow user scripts.
2. Open [tweet-grabber.user.js](https://raw.githubusercontent.com/danielgsanchez/tweet-grabber/main/tweet-grabber.user.js) and confirm the installation.
3. Reload any open X tab.

To change the file name, open the script manager's menu on X and choose **File name options**. The manager updates the script automatically.

`tweet-grabber.user.js` is generated from the extension's files. After changing them, rebuild it from a terminal on Linux or macOS, or from Git Bash on Windows:

```bash
sh userscript/build.sh
```

## Releases

To publish a new version, change `version` in `manifest.json`, run `sh userscript/build.sh` and push to `main`. A GitHub Actions workflow then creates the release and its ZIP. It fails if `tweet-grabber.user.js` is out of date.

Pushing a new version also updates the userscript for everyone, since script managers read it directly from `main`.

## How it works

- `page-hook.js` reads the post data X's own page receives, because videos on the page are blob URLs that can't be downloaded directly. Each video is matched to its thumbnail.
- `content.js` places the button and works out which photo or video is under the pointer.
- `background.js` saves the files using `chrome.downloads`.

The extension only runs on `x.com` and `twitter.com` and only asks for the `downloads` and `storage` permissions. It sends nothing to any server other than X and its media servers.

It relies on X's current page structure and private web API, so it can stop working whenever X changes them.

## License

[MIT](LICENSE). Bug reports and suggestions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md).

## Disclaimer

This is an unofficial personal project, not affiliated with or endorsed by X Corp. Only download content you have the right to save, and respect other people's rights and X's terms.
