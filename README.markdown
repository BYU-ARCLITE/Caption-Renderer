Caption Renderer
===========

What does Caption Renderer do?
-------------------------

* Implements the WHATWG Specification for rending TimedTextTracks and TextTrackCues
* Renders captions on any HTML Element
* Reads text track info from video elements
* Synchronizes with anything implementing the HTML5 MediaElement API.
* Implements a rich JavaScript API for customizing rendering behaviors
* Works in Firefox, IE9, Safari, Chrome, & Opera 11
* Adds ARIA attributes for accessibility

Using Caption Renderer
------------------

```html
<script type="text/javascript" src="js/caption-renderer.js"></script>
<script type="text/javascript">
	window.addEventListener("load",function(eventData) {
		var captionedElement = document.getElementById('captioned');
		var renderer = CaptionRenderer(captioned,{});
	});
</script>
```

This will return a renderer object exposing a `.tracks` property which you can use to dynamically manipulate the track data as per the WHATWG specification.

The first parameter must be a single DOM element. The second parameter is an options object.

Captions are updated automatically whenever the renderer's currentTime attribute is set.
You can tell the renderer to update captions at any other time (e.g., if track modes change or cue contents change) by calling
```javascript
renderer.rebuildCaptions(true);
```
Passing in 'false' will result in only re-rendering if the set of active cues has changed. Passing in 'true' reconstructs all of the captions no matter what.

Use 
```javascript
renderer.refreshLayout();
```
to re-calculate cue size and positioning in the case of resizing or externally-imposed mutations to rendered cue elements (e.g., from typing into a contenteditable caption).

Options
---------------------------------

The following options can be passed to CaptionRenderer:

* `appendCueCanvasTo` (HTML Element) - specifies where in the DOM to place the caption elements; defaults to document.body.
* `fontSizeRatio` (Float) - The cue font size as a percentage (0 - 100) of the height of a given captioned video. Defaults to 4.5%.
* `minFontSize` (Float) - Defines the minimum allowable font size with which cue text will be rendered (in points). Defaults to 10pt.
* `lineHeightRatio` (Float) - The ratio of line height to font size. Defaults to 1.3.
* `minLineHeight` (Float) - Defines the minimum line height with which cue text will be rendered (in points). Defaults to 16pt.
* `sizeCuesByTextBoundingBox` (Boolean) - Sets the default cue size by the bounding box of the text, rather than size them to 100% of the available rendering area (as per the WebVTT spec). Defaults to false.
* `showDescriptions` (Boolean) - Tells CaptionRenderer to make the text of audio description tracks visible as subtitles. Useful for debugging & editing. Defaults to false.
* `renderCue` (Function) - Defines a custom rendering function for turning cues into HTML.

Custom Rendering
---------------------------------

Custom rendering cunctions are passed in three arguments: a renderedCue object, an area object, and a deferal callback.

Custom functions interact with CaptionRenderer by manipulating the properties of the renderedeCue and area objects.
Via the renderedCue object, you can access the underlying `.cue`, track `kind`, `language`, `mode`, and `trackLabel` properties, and additional control properties.

* `node` (HTML Element) - Must be set to an HTML Element to be used as the representation of the cue. If it is not set, nothing will be rendered.
* `done` (Boolean) - Idicates whether or not this cue has been rendered previously and cached.
* `dirty` (Boolean) - Indicates whether a cached rendering may be out of date and need re-doing; `renderedCue.cleanup()` will destroy any previous renders.
* `collector` (Function) -  a function to be run when a cue is no longer displayed or is otherwise `.cleanup()`ed. Intended for removing event listeners, etc.

