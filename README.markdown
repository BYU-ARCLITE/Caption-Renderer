Captionator
===========

**Simple closed-captioning polyfill for HTML5. Just 8KB when gzipped!**


What does Captionator do?
-------------------------

* Implements the WHATWG `TimedTextTrack` Specification, complete with the full JavaScript API
* Supports the `<track>` element
* Supports 100% of WebVTT, along with WebVTT v2 proposed features
* Additional support for SRT, SBV, and SUB caption/subtitle formats
* Works in Firefox 3.5+, IE9, Safari 4+, Chrome, Opera 11... basically any browser which supports HTML5 Video!
* Small, configurable, and under active development
* Library independent
* Accessible, with ARIA support
* Minimal global namespace footprint (written with a closure)

What can I do with Captionator?
--------------------------

* Add subtitles to make foreign-language video content available to your audience
* Add captions for the hard of hearing
* Add descriptions for the blind or vision impaired
* Add time-sensitive thumbnails to your custom video seek bar using `metadata` tracks
* Display realtime tweets or timed comments on top of your video, like soundcloud
* Fancy chapter based navigation with the `chapters` track type
* Overlay lyrics, interview supers, or explanatory text on your videos
* ...and much, much more!

You can see a demo of Captionator here: http://captionatorjs.com/demo.html

Using Captionator
------------------

After including the library, adding captions to your video is pretty simple:

```html
<script type="text/javascript" src="js/captionator-min.js"></script>
<script type="text/javascript">
	window.addEventListener("load",function(eventData) {
		captionator.captionify();
	});
</script>
```

This will not only caption your video (this example will caption every element on 
the page with Timed Text Tracks available to it,) but it will also provide a `.tracks`
property on your video element(s) - which you can use to dynamically manipulate the track
data as per the WHATWG specification.

If you've got specific requirements about which videos get captioned, and in what
language(s), there are some extra options:

```javascript
captionator.captionify(videoElementsToCaption,defaultLanguage,options)
```

The first parameter can be an array of selectors or DOMElements, or a single selector
string or DOMElement. The second parameter is a language string.

You can use the options parameter to specify your own render function for captions, if you
don't like captionator's inbuilt renderer:

```javascript
captionator.captionify(["#yourVideoElement1","#yourVideoElement2"],"de",{ renderer: myFunction });
```

(More on this below!)

Multiple subtitles and custom render functions
---------------------------------

It's pretty straightforward to manage multiple enabled subtitle tracks. Take this set of track elements
for example:

```html
<track kind="captions" src="subs/english-subs.srt" srclang="en" label="English Subtitles" default />
<track kind="captions" src="subs/german-subs.srt" srclang="de" label="German Subtitles" />
<track kind="captions" src="subs/japanese-subs.srt" srclang="ja" label="Japanese Subtitles" />
```

In this case, the English subtitles are enabled by default. Unless you specify a custom renderer,
Captionator will automatically generate as many separate containers as are required for enabled tracks, set up
the relevant events and styles.

**Specifying a custom renderer**

Should you wish to specify your own renderer, you can use the following syntax when calling `captionator.captionify`:

```javascript
captionator.captionify(null,null,{
	"renderer": function(yourHTMLVideoElement) {
		...
	}
});
```

The renderer function you define is executed, and passed the HTMLVideoElement whenever it fires a
`timeupdate` event. You can use the `TextTrack.activeCues` to determine what cues should be displayed at any given time.

The event data for the video timeupdate event is *not* passed to your function. This is because you are defining
a renderer, not an event handler. Should future Captionator updates require caption re-rendering on different events
(or in places not triggered by events at all) code which depends on event information will not function correctly.

### Enabling and disabling subtitle tracks programatically: A Quick Guide ###

You can find a demonstration of this feature in the example file.

**Getting Tracks**

Captionator simply makes a new property (array) available through javascript on the HTMLVideoElement:

```javascript
var myVideo = document.getElementById("myVideo");
var myTracks = myVideo.tracks;
```

By extension, getting access to the track you want is as simple as:

```javascript
var firstSubtitleTrack = myVideo.tracks[0];
```

Each track defines the following user accessible properties:

* `label` - String - describes the track (in plain human language)
* `language` - BCP47 language string which describes the track
* `kind` - Resource type (one of `subtitles`, `captions`, `chapters`, `descriptions`, `metadata`.)
* `readyState` - indicates whether the resource is loaded (one of NONE/0, LOADING/1, LOADED/2, or ERROR/3)
* `mode` - the most important property (probably!) - determines whether captionator will fetch and render the resource.
* `cues` - A TextTrackCueList (functionally, an array) containing all the cues for the track
* `activeCues` - A TextTrackCueList containing all the cues for the track which are currently active
* `videoNode` - the HTMLVideoElement which the track relates to/extends. (Not in the WHATWG spec.)

Ergo, to access the property `language` from the third track, you'd use the following code:

```javascript
var thirdTrackLanguage = myVideo.tracks[2].language;
```

To enable or disable a track:

```javascript
myVideo.tracks[2].mode = captionator.TextTrack.SHOWING; // Equivalent to (integer) 2
myVideo.tracks[2].mode = captionator.TextTrack.HIDDEN; // Equivalent to (integer) 1
myVideo.tracks[2].mode = captionator.TextTrack.OFF; // Equivalent to (integer) 0
```

The track is then enabled/disabled when the video fires a `timeupdate` event, or when a track mode changes.
You can update it immediately (although Captionator handles this itself in nearly every case) like so:

```javascript
captionator.rebuildCaptions(myVideo);
```

(Where `myVideo` is an instance of a captioned HTMLVideoElement)

For a more advanced example, see the subtitle selector in the example file.

Options
---------------------------------

The following lists options which you can pass to captionator:

* `enableCaptionsByDefault` (Boolean) - determines whether to show captions by default, if a caption language matches the user's UA language or is selected for display according to the rules outlined in the [WHATWG specification](http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html). Tracks with the `enabled` attribute set to `true` will be displayed regardless of this option.
* `enableDescriptionsByDefault` (Boolean) - as above, except for `description` track types instead of `caption` or `subtitle` types.
* `exportObjects` (Boolean) - instructs Captionator to export its own implementation of the TimedTextTrack objects (TextTrack, TextTrackCue, etc.) and their relevant constants into the global scope. Captionator ordinarily keeps these within its own object. You might find this useful for creating code which utilises `instanceof` conditionals, or creates instances of these objects itself, which you want to be native-TextTrack-support-agnostic. (Phew, what a mouthful.)
* `renderer` (Function) - sets an alternative renderer for captions & subtitles. You can utilise the WHATWG TimedTextTrack specification to manipulate or get information about the tracks themselves.
* `processCueHTML` (Boolean) - determines whether HTML/WebVTT cue source is parsed. Defaults to true. If this is set to false, cue source will be retained as unprocessed text, and special WebVTT cue spans will be appended straight into the DOM (rather than perform their function as detailed in the WebVTT specification.) `metadata` tracks are never processed, regardless of the value of this setting.
* `sanitiseCueHTML` (Boolean) - determines whether non-WebVTT-compliant tags are dropped when parsing, thereby sanitising the source of WebVTT cues. Defaults to true. Cue source is not sanitised when `processCueHTML` is set to false.
* `ignoreWhitespace` (Boolean) - By default, line breaks (single) within cues are converted to <br /> elements in HTML. Set this to true to prevent whitespace from changing processing behaviour. By default, this is false.
* `controlHeight` (Integer) - defines an 'exclusion zone' (where cues will not be rendered) at the bottom of the video to allow for video controls. The available area for cues is determined based on the height of the video less the height of the video controls. By default, if the `controls` attribute is present on the video element, this is calculated automatically based on the user agent. Should the `controls` attribute be missing, this value is zero. If you want to implement your own controls, use this to tell captionator how tall they are.
* `debugMode` (Boolean) - If true, draws a canvas with debugging information for cue positioning on top (in z-space) of the video. The canvas displays `vertical`, `vertical-lr`, and `horizontal` line divisions, as well as Captionator's own understanding of the available cue area (post cue-rendering.) This option is not available in the minified builds of Captionator.
* `appendCueCanvasTo` (HTMLElement | DOM Query as string) - Defines a node in the document within which Captionator should render the video cues. This function is intended to allow you to create a wrapper div and have Captionator render cues within it - hopefully easing the process of making a custom video player. If successful, and Captionator is able to find the wrapper node based on your input, it will set the `top` and `left` values of its own cue canvas to zero, rather than finding the offset position of the video element itself, and append its cue canvas within the wrapper when rendering. If the query fails, the cue canvas will be appended to the body as normal, and positioned using the offset position of the video element.
* `enableHighResolution` (Boolean) - If true, Captionator sets up a 20ms timer for refreshing cues and captions, firing much more rapidly than the default `timeupdate` event listener on the video element. This option causes Captionator to use a lot more of the user's CPU time - only use this if you have a real need for quick, <250ms response times. This option defaults to false.

#### Styling Options ####
* `minimumFontSize` (Float) - Defines the minimum allowable font size with which Captionator will render cues (in points.) Defaults to 10pt.
* `minimumLineHeight` (Float) - Defines the minimum line height with which Captionator will render cues (in points.) Defaults to 16pt.
* `fontSizeVerticalPercentage` (Float) - The cue font size as a percentage (0 - 100) of the height of a given captioned video. Defaults to 4.5%.
* `lineHeightRatio` (Float) - The ratio of line height to font size. Defaults to 1.5.
* `cueBackgroundColour` (Array) - An array containing four items, each for: red (R), green (G), blue (B), and alpha (A), in that order, which define the background colour of cues. Defaults to [0,0,0,0.5].
* `sizeCuesByTextBoundingBox` (Boolean) - Instructs Captionator to set the cue size by the default bounding box of the text, rather than size them to 100% of the available rendering area (the WebVTT specification's method, and Captionator's default method.) False by default.


Video and Audio tracks (MediaTrack)
-----------------------------------

**PLEASE NOTE:** The WHATWG now has a specification for Media Tracks, which is separated out into `audioTrack` and `videoTrack` categories. For now, this functionality remains in Captionator, but it will change. **I would advise you to avoid using it for now.**

Captionator has experimental support for HTML5 video and Audio tracks (designed both for assistive purposes, and for enriching existing media.)

This is a documentation category in and of itself, so I've moved it to [MediaTrack.markdown](https://github.com/cgiffard/Captionator/blob/master/MediaTrack.markdown).


New Features
---------------

* Supports WebVTT proposed features such as `DEFAULTS`, `STYLE`, and `COMMENT` cues
* Optional auto cue sizing algorithm, which sizes the cue to the text bounding box
* Brand new WebVTT renderer, with new styling options!
* Performs automatic validation of WebVTT cue spans and HTML!

Thanks
----------------
Thanks to @silviapfeiffer for her knowledge and assistance with some of the hairier aspects of these specifications! Thanks also to @ourmaninjapan for his welcome assistance with Japanese text/line breaking algorithms!

Licence
----------------

Copyright (c) 2012, Christopher Giffard
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.