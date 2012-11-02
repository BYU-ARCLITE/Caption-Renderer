Caption Renderer
===========

What does Caption Renderer do?
-------------------------

* Implements the WHATWG `TimedTextTrack` Specification, complete with the full JavaScript API
* Supports 100% of WebVTT, along with WebVTT v2 proposed features
* Works in Firefox 3.5+, IE9, Safari 4+, Chrome, Opera 11... basically any browser which supports HTML5 Video!
* Library independent
* Accessible, with ARIA support
* Supports WebVTT proposed features such as `DEFAULTS`, `STYLE`, and `COMMENT` cues
* Optional auto cue sizing algorithm, which sizes the cue to the text bounding box
* Performs automatic validation of WebVTT cue spans and HTML!

Using Caption Renderer
------------------

After including the library, adding captions to your video is pretty simple:

```html
<script type="text/javascript" src="js/caption-renderer.js"></script>
<script type="text/javascript">
	window.addEventListener("load",function(eventData) {
		var videoObject = document.getElementsByTagName("video")[0];
		var renderer = CaptionRenderer(videoObject,null,{});
	});
</script>
```

This will return a renderer object exposing a `.tracks` which you can use to dynamically manipulate the track data as per the WHATWG specification.

The first parameter must be a single DOM element. The second parameter is a language string. The third parameter is an options object.

### Enabling and disabling subtitle tracks programatically: A Quick Guide ###

Each track defines the following user accessible properties:

* `label` - String - describes the track (in plain human language)
* `language` - BCP47 language string which describes the track
* `kind` - Resource type (one of `subtitles`, `captions`, `chapters`, `descriptions`, `metadata`.)
* `readyState` - indicates whether the resource is loaded (one of NONE/0, LOADING/1, LOADED/2, or ERROR/3)
* `mode` - the most important property (probably!) - determines whether captionator will fetch and render the resource.
* `cues` - A TextTrackCueList (functionally, an array) containing all the cues for the track
* `activeCues` - A TextTrackCueList containing all the cues for the track which are currently active
* `renderer` - the CaptionRenderer object which manages the track. (Not in the WHATWG spec.)

Captions are updated when the video fires a `timeupdate` event, or when a track mode changes.
You can update it immediately like so:

```javascript
renderer.rebuildCaptions(true);
```

Passing in 'false' will result in only re-rendering if the set of active cues has changed. Passing in 'true' reconstructs all of the captions no matter what.

Options
---------------------------------

The following lists options which you can pass to captionator:

* `enableCaptionsByDefault` (Boolean) - determines whether to show captions by default, if a caption language matches the user's UA language or is selected for display according to the rules outlined in the [WHATWG specification](http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html). Tracks with the `enabled` attribute set to `true` will be displayed regardless of this option.
* `enableDescriptionsByDefault` (Boolean) - as above, except for `description` track types instead of `caption` or `subtitle` types.
* `processCueHTML` (Boolean) - determines whether HTML/WebVTT cue source is parsed. Defaults to true. If this is set to false, cue source will be retained as unprocessed text, and special WebVTT cue spans will be appended straight into the DOM (rather than perform their function as detailed in the WebVTT specification.) `metadata` tracks are never processed, regardless of the value of this setting.
* `sanitiseCueHTML` (Boolean) - determines whether non-WebVTT-compliant tags are dropped when parsing, thereby sanitising the source of WebVTT cues. Defaults to true. Cue source is not sanitised when `processCueHTML` is set to false.
* `ignoreWhitespace` (Boolean) - By default, line breaks (single) within cues are converted to <br /> elements in HTML. Set this to true to prevent whitespace from changing processing behaviour. By default, this is false.
* `controlHeight` (Integer) - defines an 'exclusion zone' (where cues will not be rendered) at the bottom of the video to allow for video controls. The available area for cues is determined based on the height of the video less the height of the video controls. By default, if the `controls` attribute is present on the video element, this is calculated automatically based on the user agent. Should the `controls` attribute be missing, this value is zero. If you want to implement your own controls, use this to tell captionator how tall they are.
* `debugMode` (Boolean) - If true, draws a canvas with debugging information for cue positioning on top (in z-space) of the video. The canvas displays `vertical`, `vertical-lr`, and `horizontal` line divisions, as well as Captionator's own understanding of the available cue area (post cue-rendering.) This option is not available in the minified builds of Captionator.
* `appendCueCanvasTo` (HTMLElement) - Defines a node in the document within which captions should be rendered. This is intended to allow you to create a wrapper div and have cues rendered within it, easing the process of making a custom video player.
* `enableHighResolution` (Boolean) - If true, the renderer sets up a frame timer for refreshing cues and captions, firing much more rapidly than the default `timeupdate` event listener on the video element. This option causes the renderer to use a lot more of the user's CPU time - only use this if you have a real need for quick, <250ms response times. This option defaults to false.

#### Styling Options ####
* `minimumFontSize` (Float) - Defines the minimum allowable font size with which Captionator will render cues (in points.) Defaults to 10pt.
* `minimumLineHeight` (Float) - Defines the minimum line height with which Captionator will render cues (in points.) Defaults to 16pt.
* `fontSizeVerticalPercentage` (Float) - The cue font size as a percentage (0 - 100) of the height of a given captioned video. Defaults to 4.5%.
* `lineHeightRatio` (Float) - The ratio of line height to font size. Defaults to 1.5.
* `cueBackgroundColour` (Array) - An array containing four items, each for: red (R), green (G), blue (B), and alpha (A), in that order, which define the background colour of cues. Defaults to [0,0,0,0.5].
* `sizeCuesByTextBoundingBox` (Boolean) - Instructs Captionator to set the cue size by the default bounding box of the text, rather than size them to 100% of the available rendering area (the WebVTT specification's method, and Captionator's default method.) False by default.