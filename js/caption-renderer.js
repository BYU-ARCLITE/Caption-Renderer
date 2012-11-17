/*
	Captionator 0.5.1 [CaptionCrunch]
	Christopher Giffard, 2011
	Share and enjoy

	https://github.com/cgiffard/Captionator
*/
/*global HTMLVideoElement: true, NodeList: true, Audio: true, HTMLElement: true, document:true, window:true, XMLHttpRequest:true, navigator:true */
/*jshint strict:true */
/*Tab indented, tab = 4 spaces*/

var cache = {};

var CaptionRenderer = (function() {
	"use strict";

	/*	positionCue(DOMNode, cueObject, videoNode)
		Styles and positions cue nodes according to the WebVTT specification.
		First parameter: The DOMNode representing the cue to style. This parameter is mandatory.
		Second parameter: The TextTrackCue itself.
		Third Parameter: The HTMLVideoElement with which the cue is associated. This parameter is mandatory.
	*/
	var positionCue = (function(){
		function hasLength(s) { return !!s.length; }
		// Function to facilitate vertical text alignments in browsers which do not support writing-mode
		// (sadly, all the good ones!)
		function spanify(DOMNode,fontSize,lineHeight) {
			var characterCount = 0,
				templateNode = document.createElement('span');
			templateNode.className = 'captionator-cue-character';
			applyStyles(templateNode,{
				"height":	fontSize + "px",
				"width":	lineHeight + "px"
			});
			[].forEach.call(DOMNode.childNodes,function(currentNode,nodeIndex) {
				var replacementNode;
				if (currentNode.nodeType === 3) {
					replacementNode = document.createElement("span");
					currentNode.nodeValue
							.split(/(.)/)
							.filter(hasLength)
							.forEach(function(s){
								var span = templateNode.cloneNode(false);
								span.textContent = s;
								replacementNode.appendChild(span);
								characterCount++;
							});
					currentNode.parentNode.replaceChild(replacementNode,currentNode);
				} else if (DOMNode.childNodes[nodeIndex].nodeType === 1) {
					characterCount += spanify(DOMNode.childNodes[nodeIndex],fontSize,lineHeight);
				}
			});
			return characterCount;
		};
		/* checkDirection(text)
			Determines whether the text string passed into the function is an RTL (right to left) or LTR (left to right) string.
			RETURNS: 'rtl' if the text is a right to left string, 'ltr' if the text is a left to right string, or an empty string
			if the direction could not be determined.
		*/
		function checkDirection(text) {
			// Inspired by http://www.frequency-decoder.com/2008/12/12/automatically-detect-rtl-text
			var ltrChars            = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF',
				rtlChars            = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC',
				ltrDirCheckRe       = new RegExp('^[^'+rtlChars+']*['+ltrChars+']'),
				rtlDirCheckRe       = new RegExp('^[^'+ltrChars+']*['+rtlChars+']');
			return !!rtlDirCheckRe.test(text) ? 'rtl' : (!!ltrDirCheckRe.test(text) ? 'ltr' : '');
		}
		return function(DOMNode, cueObject, renderer) {
			// Variables for maintaining render calculations
			var cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0, cueSize, cueAlignment, cuePaddingLR = 0, cuePaddingTB = 0;
			var baseFontSize, basePixelFontSize, baseLineHeight, tmpHeightExclusions;
			var videoHeightInLines, videoWidthInLines, pixelLineHeight, verticalPixelLineHeight, charactersPerLine = 0, characterCount = 0;
			var characters = 0, lineCount = 0, finalLineCharacterCount = 0, finalLineCharacterHeight = 0, currentLine = 0;
			var characterX, characterY, characterPosition = 0;
			var options = renderer.options;
			var maxCueSize = 100, internalTextPosition = 50, textBoundingBoxWidth = 0, textBoundingBoxPercentage = 0, autoSize = true;
			var videoElement = renderer.element;
			var videoMetrics = renderer.videoMetrics;
			var availableCueArea = renderer.availableCueArea;

			if (cueObject.direction === "horizontal") {
				// Calculate text bounding box
				// (isn't useful for vertical cues, because we're doing all glyph positioning ourselves.)
				applyStyles(DOMNode,{
					"width": "auto",
					"position": "static",
					"display": "inline-block",
					"padding": "1em"
				});

				textBoundingBoxWidth = parseInt(DOMNode.offsetWidth,10);
				textBoundingBoxPercentage = Math.floor((textBoundingBoxWidth / availableCueArea.width) * 100);
				textBoundingBoxPercentage = textBoundingBoxPercentage <= 100 ? textBoundingBoxPercentage : 100;
			}

			// Calculate font metrics
			baseFontSize = Math.max(((videoMetrics.height * (options.fontSizeVerticalPercentage/100))/96)*72, options.minimumFontSize);
			basePixelFontSize = Math.floor((baseFontSize/72)*96);
			baseLineHeight = Math.max(Math.floor(baseFontSize * options.lineHeightRatio), options.minimumLineHeight);
			pixelLineHeight = Math.ceil((baseLineHeight/72)*96);
			verticalPixelLineHeight	= pixelLineHeight;
			
			if (pixelLineHeight * Math.floor(videoMetrics.height / pixelLineHeight) < videoMetrics.height) {
				pixelLineHeight = Math.floor(videoMetrics.height / Math.floor(videoMetrics.height / pixelLineHeight));
				baseLineHeight = Math.ceil((pixelLineHeight/96)*72);
			}
			
			if (pixelLineHeight * Math.floor(videoMetrics.width / pixelLineHeight) < videoMetrics.width) {
				verticalPixelLineHeight = Math.ceil(videoMetrics.width / Math.floor(videoMetrics.width / pixelLineHeight));
			}
			
			// Calculate render area height & width in lines
			videoHeightInLines = Math.floor(availableCueArea.height / pixelLineHeight);
			videoWidthInLines = Math.floor(availableCueArea.width / verticalPixelLineHeight);
			
			// Calculate cue size and padding
			if (parseFloat(String(cueObject.size).replace(/[^\d\.]/ig,"")) === 0) {
				// We assume (given a size of 0) that no explicit size was set.
				// Depending on settings, we either use the WebVTT default size of 100% (the js default behaviour),
				// or the proportion of the video the text bounding box takes up (widthwise) as a percentage (proposed behaviour, LeanBack's default)
				if (options.sizeCuesByTextBoundingBox === true) {
					cueSize = textBoundingBoxPercentage;
				} else {
					cueSize = 100;
					autoSize = false;
				}
			} else {
				autoSize = false;
				cueSize = parseFloat(String(cueObject.size).replace(/[^\d\.]/ig,""));
				cueSize = cueSize <= 100 ? cueSize : 100;
			}
			
			cuePaddingLR = cueObject.direction === "horizontal" ? Math.floor(videoMetrics.width * 0.01) : 0;
			cuePaddingTB = cueObject.direction === "horizontal" ? 0 : Math.floor(videoMetrics.height * 0.01);
			
			if (cueObject.linePosition === "auto") {
				cueObject.linePosition = cueObject.direction === "horizontal" ? videoHeightInLines : videoWidthInLines;
			} else if (String(cueObject.linePosition).match(/\%/)) {
				cueObject.snapToLines = false;
				cueObject.linePosition = parseFloat(String(cueObject.linePosition).replace(/\%/ig,""));
			}
			
			if (cueObject.direction === "horizontal") {
				cueHeight = pixelLineHeight;

				if (cueObject.textPosition !== "auto" && autoSize) {
					internalTextPosition = parseFloat(String(cueObject.textPosition).replace(/[^\d\.]/ig,""));
					
					// Don't squish the text
					if (cueSize - internalTextPosition > textBoundingBoxPercentage) {
						cueSize -= internalTextPosition;
					} else {
						cueSize = textBoundingBoxPercentage;
					}
				}

				if (cueObject.snapToLines === true) {
					cueWidth = availableCueArea.width * (cueSize/100);
				} else {
					cueWidth = videoMetrics.width * (cueSize/100);
				}

				if (cueObject.textPosition === "auto") {
					cueX = ((availableCueArea.right - cueWidth) / 2) + availableCueArea.left;
				} else {
					internalTextPosition = parseFloat(String(cueObject.textPosition).replace(/[^\d\.]/ig,""));
					cueX = ((availableCueArea.right - cueWidth) * (internalTextPosition/100)) + availableCueArea.left;
				}
				
				if (cueObject.snapToLines === true) {
					cueY = ((videoHeightInLines-1) * pixelLineHeight) + availableCueArea.top;
				} else {
					tmpHeightExclusions = videoMetrics.controlHeight + pixelLineHeight + (cuePaddingTB*2);
					cueY = (videoMetrics.height - tmpHeightExclusions) * (cueObject.linePosition/100);
				}
				
			} else {
				// Basic positioning
				cueY = availableCueArea.top;
				cueX = availableCueArea.right - verticalPixelLineHeight;
				cueWidth = verticalPixelLineHeight;
				cueHeight = availableCueArea.height * (cueSize/100);
				
				// Split into characters, and continue calculating width & positioning with new info
				characterCount = spanify(DOMNode,basePixelFontSize,verticalPixelLineHeight);
				characters = [].slice.call(DOMNode.querySelectorAll("span.captionator-cue-character"),0);
				charactersPerLine = Math.floor((cueHeight-cuePaddingTB*2)/basePixelFontSize);
				cueWidth = Math.ceil(characterCount/charactersPerLine) * verticalPixelLineHeight;
				lineCount = Math.ceil(characterCount/charactersPerLine);
				finalLineCharacterCount = characterCount - (charactersPerLine * (lineCount - 1));
				finalLineCharacterHeight = finalLineCharacterCount * basePixelFontSize;
				
				// Work out CueX taking into account linePosition...
				if (cueObject.snapToLines === true) {
					cueX = cueObject.direction === "vertical-lr" ? availableCueArea.left : availableCueArea.right - cueWidth;
				} else {
					var temporaryWidthExclusions = cueWidth + (cuePaddingLR * 2);
					if (cueObject.direction === "vertical-lr") {
						cueX = (videoMetrics.width - temporaryWidthExclusions) * (cueObject.linePosition/100);
					} else {
						cueX = (videoMetrics.width-temporaryWidthExclusions) - ((videoMetrics.width - temporaryWidthExclusions) * (cueObject.linePosition/100));
					}
				}
				
				// Work out CueY taking into account textPosition...
				if (cueObject.textPosition === "auto") {
					cueY = ((availableCueArea.bottom - cueHeight) / 2) + availableCueArea.top;
				} else {
					cueObject.textPosition = parseFloat(String(cueObject.textPosition).replace(/[^\d\.]/ig,""));
					cueY = ((availableCueArea.bottom - cueHeight) * (cueObject.textPosition/100)) + 
							availableCueArea.top;
				}
				
				
				// Iterate through the characters and position them accordingly...
				currentLine = 0;
				characterPosition = 0;
				characterX = 0;
				characterY = 0;
				
				characters.forEach(function(characterSpan,characterCount) {
					if (cueObject.direction === "vertical-lr") {
						characterX = verticalPixelLineHeight * currentLine;
					} else {
						characterX = cueWidth - (verticalPixelLineHeight * (currentLine+1));
					}
					
					if (cueObject.alignment === "start" || (cueObject.alignment !== "start" && currentLine < lineCount-1)) {
						characterY = (characterPosition * basePixelFontSize) + cuePaddingTB;
					} else if (cueObject.alignment === "end") {
						characterY = ((characterPosition * basePixelFontSize)-basePixelFontSize) + ((cueHeight+(cuePaddingTB*2))-finalLineCharacterHeight);
					} else if (cueObject.alignment === "middle") {
						characterY = (((cueHeight - (cuePaddingTB*2))-finalLineCharacterHeight)/2) + (characterPosition * basePixelFontSize);
					}
					
					applyStyles(characterSpan,{
						"top": characterY + "px",
						"left": characterX + "px"
					});
					
					if (characterPosition >= charactersPerLine-1) {
						characterPosition = 0;
						currentLine ++;
					} else {
						characterPosition ++;
					}
				});
			}
			
			if (cueObject.direction === "horizontal") {
				if (checkDirection(String(cueObject.text)) === "rtl") {
					cueAlignment = {"start":"right","middle":"center","end":"left"}[cueObject.alignment];
				} else {	
					cueAlignment = {"start":"left","middle":"center","end":"right"}[cueObject.alignment];
				}
			}

			applyStyles(DOMNode,{
				"position": "absolute",
				"overflow": "hidden",
				"width": cueWidth + "px",
				"height": cueHeight + "px",
				"top": cueY + "px",
				"left": cueX + "px",
				"padding": cuePaddingTB + "px " + cuePaddingLR + "px",
				"textAlign": cueAlignment,
				"backgroundColor": "rgba(" + options.cueBackgroundColour.join(",") + ")",
				"direction": checkDirection(String(cueObject.text)),
				"lineHeight": baseLineHeight + "pt",
				"boxSizing": "border-box"
			});
			
			if (cueObject.direction === "vertical" || cueObject.direction === "vertical-lr") {
				// Work out how to shrink the available render area
				// If subtracting from the right works out to a larger area, subtract from the right.
				// Otherwise, subtract from the left.	
				if (((cueX - availableCueArea.left) - availableCueArea.left) >=
					(availableCueArea.right - (cueX + cueWidth))) {
					
					availableCueArea.right = cueX;
				} else {
					availableCueArea.left = cueX + cueWidth;
				}
				
				availableCueArea.width =
					availableCueArea.right - 
					availableCueArea.left;
				
			} else {
				// Now shift cue up if required to ensure it's all visible
				if (DOMNode.scrollHeight > DOMNode.offsetHeight * 1.2) {
					if (cueObject.snapToLines) {
						var upwardAjustmentInLines = 0;
						while (DOMNode.scrollHeight > DOMNode.offsetHeight * 1.2) {
							cueHeight += pixelLineHeight;
							DOMNode.style.height = cueHeight + "px";
							upwardAjustmentInLines ++;
						}
						
						cueY = cueY - (upwardAjustmentInLines*pixelLineHeight);
						DOMNode.style.top = cueY + "px";
					} else {
						// Not working by lines, so instead of shifting up, simply throw out old cueY calculation
						// and completely recalculate its value
						var upwardAjustment = (DOMNode.scrollHeight - cueHeight);
						cueHeight = (DOMNode.scrollHeight + cuePaddingTB);
						tmpHeightExclusions = videoMetrics.controlHeight + cueHeight + (cuePaddingTB*2);
						cueY = (videoMetrics.height - tmpHeightExclusions) * (cueObject.linePosition/100);
						
						DOMNode.style.height = cueHeight + "px";
						DOMNode.style.top = cueY + "px";
					}
				}
							
				// Work out how to shrink the available render area
				// If subtracting from the bottom works out to a larger area, subtract from the bottom.
				// Otherwise, subtract from the top.
				if (((cueY - availableCueArea.top) - availableCueArea.top) >=
					(availableCueArea.bottom - (cueY + cueHeight)) &&
					availableCueArea.bottom > cueY) {
					availableCueArea.bottom = cueY;
				} else if (videoElement._captionator_availableCueArea.top < cueY + cueHeight) {
					availableCueArea.top = cueY + cueHeight;
				}
				
				availableCueArea.height =
					availableCueArea.bottom - 
					availableCueArea.top;
			}
			
			// DEBUG FUNCTIONS
			// This function can be used for debugging WebVTT captions. It will not be
			// included in production versions of 
			// -----------------------------------------------------------------------
			if (options.debugMode) {
				var debugCanvas, debugContext;
				var generateDebugCanvas = function() {
					if (!debugCanvas) {
						if (renderer.captionatorDebugCanvas) {
							debugCanvas = renderer.captionatorDebugCanvas;
							debugContext = renderer.captionatorDebugContext;
						} else {
							debugCanvas = document.createElement("canvas");
							debugCanvas.setAttribute("width",videoMetrics.width);
							debugCanvas.setAttribute("height",videoMetrics.height - videoMetrics.controlHeight);
							document.body.appendChild(debugCanvas);
							applyStyles(debugCanvas,{
								"position": "absolute",
								"top": videoMetrics.top + "px",
								"left": videoMetrics.left + "px",
								"width": videoMetrics.width + "px",
								"height": (videoMetrics.height - videoMetrics.controlHeight) + "px",
								"zIndex": 3000
							});
					
							debugContext = debugCanvas.getContext("2d");
							renderer.captionatorDebugCanvas = debugCanvas;
							renderer.captionatorDebugContext = debugContext;
						}
					}
				};
				
				var clearDebugCanvas = function() {
					generateDebugCanvas();
					debugCanvas.setAttribute("width",videoMetrics.width);
				};
				
				var drawLines = function() {
					var lineIndex;
					
					// Set up canvas for drawing debug information
					generateDebugCanvas();
					
					debugContext.strokeStyle = "rgba(255,0,0,0.5)";
					debugContext.lineWidth = 1;
					
					// Draw horizontal line dividers
					debugContext.beginPath();
					for (lineIndex = 0; lineIndex < videoHeightInLines; lineIndex ++) {
						debugContext.moveTo(0.5,(lineIndex*pixelLineHeight)+0.5);
						debugContext.lineTo(videoMetrics.width,(lineIndex*pixelLineHeight)+0.5);
					}
					
					debugContext.closePath();
					debugContext.stroke();
					debugContext.beginPath();
					debugContext.strokeStyle = "rgba(0,255,0,0.5)";
					
					// Draw vertical line dividers
					// Right to left, vertical
					for (lineIndex = videoWidthInLines; lineIndex >= 0; lineIndex --) {
						debugContext.moveTo((videoMetrics.width-(lineIndex*verticalPixelLineHeight))-0.5,-0.5);
						debugContext.lineTo((videoMetrics.width-(lineIndex*verticalPixelLineHeight))-0.5,videoMetrics.height);
					}
					
					debugContext.closePath();
					debugContext.stroke();
					debugContext.beginPath();
					debugContext.strokeStyle = "rgba(255,255,0,0.5)";
					
					// Draw vertical line dividers
					// Left to right, vertical
					for (lineIndex = 0; lineIndex <= videoWidthInLines; lineIndex ++) {
						debugContext.moveTo((lineIndex*verticalPixelLineHeight)+0.5,-0.5);
						debugContext.lineTo((lineIndex*verticalPixelLineHeight)+0.5,videoMetrics.height);
					}
					
					debugContext.stroke();
					
					videoElement.linesDrawn = true;
				};
				
				var drawAvailableArea = function() {
					generateDebugCanvas();
					
					debugContext.fillStyle = "rgba(100,100,255,0.5)";
					
					debugContext.fillRect(
							availableCueArea.left,
							availableCueArea.top,
							availableCueArea.right,
							availableCueArea.bottom);
					debugContext.stroke();
					
				};
				
				clearDebugCanvas();
				drawAvailableArea();
				drawLines();
			}
			// END DEBUG FUNCTIONS
		}
	}());
	/* getNodeMetrics(DOMNode)
		Calculates and returns a number of sizing and position metrics from a DOMNode of any variety (though this function is intended
		to be used with HTMLVideoElements.) Returns the height of the default controls on a video based on user agent detection
		(As far as I know, there's no way to dynamically calculate the height of browser UI controls on a video.)
		First parameter: DOMNode from which to calculate sizing metrics. This parameter is mandatory.
	
		RETURNS:
		An object with the following properties:
			left: The calculated left offset of the node
			top: The calculated top offset of the node
			height: The calculated height of the node
			width: The calculated with of the node
			controlHeight: If the node is a video and has the `controls` attribute present, the height of the UI controls for the video. Otherwise, zero.
	*/
	function getNodeMetrics(DOMNode) {
		var nodeComputedStyle = window.getComputedStyle(DOMNode,null);
		var offsetObject = DOMNode;
		var offsetTop = DOMNode.offsetTop, offsetLeft = DOMNode.offsetLeft;
		var width = DOMNode, height = 0;
		var controlHeight = 0;
		
		width = parseInt(nodeComputedStyle.getPropertyValue("width"),10);
		height = parseInt(nodeComputedStyle.getPropertyValue("height"),10);
		
		// Slightly verbose expression in order to pass JSHint
		while (!!(offsetObject = offsetObject.offsetParent)) {
			offsetTop += offsetObject.offsetTop;
			offsetLeft += offsetObject.offsetLeft;
		}
	
		if (DOMNode.hasAttribute("controls")) {
			// Get heights of default control strip in various browsers
			// There could be a way to measure this live but I haven't thought/heard of it yet...
			var UA = navigator.userAgent.toLowerCase();
			if (UA.indexOf("chrome") !== -1) {
				controlHeight = 32;
			} else if (UA.indexOf("opera") !== -1) {
				controlHeight = 25;
			} else if (UA.indexOf("firefox") !== -1) {
				controlHeight = 28;
			} else if (UA.indexOf("ie 9") !== -1 || UA.indexOf("ipad") !== -1) {
				controlHeight = 44;
			} else if (UA.indexOf("safari") !== -1) {
				controlHeight = 25;
			}
		} else if (DOMNode._captionatorOptions) {
			var tmpCaptionatorOptions = DOMNode._captionatorOptions;
			if (tmpCaptionatorOptions.controlHeight) {
				controlHeight = parseInt(tmpCaptionatorOptions.controlHeight,10);
			}
		}
	
		return {
			left: offsetLeft,
			top: offsetTop,
			width: width,
			height: height,
			controlHeight: controlHeight
		};
	}
	/* applyStyles(DOMNode, Style Object)
		A fast way to apply multiple CSS styles to a DOMNode.
		First parameter: DOMNode to style. This parameter is mandatory.
		Second parameter: A key/value object where the keys are camel-cased variants of CSS property names to apply,
		and the object values are CSS property values as per the spec. This parameter is mandatory.
	*/
	function applyStyles(StyleNode, styleObject) {
		for (var styleName in styleObject) {
			if ({}.hasOwnProperty.call(styleObject, styleName)) {
				StyleNode.style[styleName] = styleObject[styleName];
			}
		}
	}
	/* processVideoElement(videoElement <HTMLVideoElement>,
							[defaultLanguage - string in BCP47],
							[options - JS Object])

		Processes track items within an HTMLVideoElement. The second and third parameter are both optional.
		First parameter: Mandatory HTMLVideoElement object.
		Second parameter: BCP-47 string for default language. If this parameter is omitted, the User Agent's language
		will be used to choose a track.
		Third parameter: as yet unused - will implement animation settings and some other global options with this
		parameter later.
		RETURNS: Reference to the HTMLVideoElement.	
	*/
	var processVideoElement = (function(){
		var counter = 0;
		function generateID() {
			counter++;
			return String("captionator")+counter.toString(36);
		}
		return function(renderer,defaultLanguage,options) {
			var trackList = [],
				videoElement = renderer.element;
			var language = navigator.language || navigator.userLanguage;
			var globalLanguage = defaultLanguage || language.split("-")[0];
			options = options instanceof Object? options : {};

			var enabledDefaultTrack = false;
			[].slice.call(videoElement.querySelectorAll("track"),0).forEach(function(trackElement) {
				var sources = (trackElement.querySelectorAll("source").length > 0)
								?trackElement.querySelectorAll("source")
								:trackElement.getAttribute("src");			
				var trackObject = renderer.addTextTrack(
										(trackElement.getAttribute("id")||generateID()),
										trackElement.getAttribute("kind"),
										trackElement.getAttribute("label"),
										trackElement.getAttribute("srclang").split("-")[0],
										sources,
										trackElement.getAttribute("type"),
										trackElement.hasAttribute("default"));
			
				trackElement.track = trackObject;
				trackObject.trackNode = trackElement;
				trackObject.renderer = renderer;
				trackList.push(trackObject);
			
				// Now determine whether the track is visible by default.
				// The comments in this section come straight from the spec...
				var trackEnabled = false;
			
				// If the text track kind is subtitles or captions and the user has indicated an interest in having a track
				// with this text track kind, text track language, and text track label enabled, and there is no other text track
				// in the media element's list of text tracks with a text track kind of either subtitles or captions whose text track mode is showing
				// ---> Let the text track mode be showing.
				if ((trackObject.kind === "subtitles" || trackObject.kind === "captions") &&
					(defaultLanguage === trackObject.language && options.enableCaptionsByDefault)) {
					if (!trackList.filter(function(trackObject) {
							if ((trackObject.kind === "captions" || trackObject.kind === "subtitles") && defaultLanguage === trackObject.language && trackObject.mode === TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
			
				// If the text track kind is chapters and the text track language is one that the user agent has reason to believe is
				// appropriate for the user, and there is no other text track in the media element's list of text tracks with a text track
				// kind of chapters whose text track mode is showing
				// ---> Let the text track mode be showing.
				if (trackObject.kind === "chapters" && (defaultLanguage === trackObject.language)) {
					if (!trackList.filter(function(trackObject) {
							if (trackObject.kind === "chapters" && trackObject.mode === TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
			
				// If the text track kind is descriptions and the user has indicated an interest in having text descriptions
				// with this text track language and text track label enabled, and there is no other text track in the media element's
				// list of text tracks with a text track kind of descriptions whose text track mode is showing
				if (trackObject.kind === "descriptions" && (options.enableDescriptionsByDefault === true) && (defaultLanguage === trackObject.language)) {
					if (!trackList.filter(function(trackObject) {
							if (trackObject.kind === "descriptions" && trackObject.mode === TextTrack.SHOWING) {
								return true;
							} else {
								return false;
							}
						}).length) {
						trackEnabled = true;
					}
				}
			
				// If there is a text track in the media element's list of text tracks whose text track mode is showing by default,
				// the user agent must furthermore change that text track's text track mode to hidden.
				if (trackEnabled === true) {
					trackList.forEach(function(trackObject) {
						if(trackObject.trackNode.hasAttribute("default") && trackObject.mode === TextTrack.SHOWING) {
							trackObject.mode = TextTrack.HIDDEN;
						}
					});
				}
			
				// If the track element has a default attribute specified, and there is no other text track in the media element's
				// list of text tracks whose text track mode is showing or showing by default
				// Let the text track mode be showing by default.
				if (trackElement.hasAttribute("default")) {
					if (!trackList.filter(function(trackObject) {
							return (trackObject.trackNode.hasAttribute("default") && trackObject.trackNode !== trackElement);
						}).length) {
						trackEnabled = true;
						trackObject.internalDefault = true;
					}
				}
			
				// Otherwise
				// Let the text track mode be disabled.
				if (trackEnabled === true) { trackObject.mode = TextTrack.SHOWING; }
			});

			window.addEventListener("resize", function() {
				renderer.rebuildCaptions(true);
			},false);

			videoElement.addEventListener("timeupdate", function(){
				// update active cues
				try {
					renderer.tracks.forEach(function(track) {
						track.currentTime = videoElement.currentTime;
					});
				} catch(error) {}
			
				renderer.rebuildCaptions(false);
			}, false);
			
			// Hires mode
			if (options.enableHighResolution === true) {
				//TODO: use requestAnimationFrame
				window.setInterval(function captionatorHighResProcessor() {
					try {
						renderer.tracks.forEach(function(track) {
							track.activeCues.refreshCues.apply(track.activeCues);
						});
					} catch(error) {}
					renderer.rebuildCaptions(false);
				},20);
			}
		}
	}());
	
	/* CaptionRenderer([dom element],
						[options - JS Object])
	
		Adds closed captions to video elements. The first, second and third parameter are both optional.
		First parameter: Use an array of either DOMElements or selector strings (compatible with querySelectorAll.)
		All of these elements will be captioned if tracks are available. If this parameter is omitted, all video elements
		present in the DOM will be captioned if tracks are available.
	*/
	function CaptionRenderer(element,defaultLanguage,options) {
		if(!(this instanceof CaptionRenderer)){ return new CaptionRenderer(element,defaultLanguage,options); }
		options = options instanceof Object? options : {};
		var containerObject = document.createElement("div");
		containerObject.className = "captionator-cue-canvas";
		// TODO(silvia): we should only do aria-live on descriptions and that doesn't need visual display
		containerObject.setAttribute("aria-live","polite");
		containerObject.setAttribute("aria-atomic","true");
		
		this.containerObject = containerObject;
		this.options = options;
		this.tracks = [];
		this.element = element;
		this.previousActiveCues = "";
		
		element.classList.add("captioned");
		
		// Apply defaults
		if (typeof(options.minimumFontSize) !== "number") {
			options.minimumFontSize = 10; //pt
		}
		if (typeof(options.minimumLineHeight) !== "number") {
			options.minimumLineHeight = 16; //pt
		}
		if (typeof(options.fontSizeVerticalPercentage) !== "number") {
			options.fontSizeVerticalPercentage = 4.5;	//	Caption font size is 4.5% of the video height
		}
		if (typeof(options.lineHeightRatio) !== "number") {
			options.lineHeightRatio = 1.5;				//	Caption line height is 1.3 times the font size
		}
		if (!(options.cueBackgroundColour instanceof Array)) {
			options.cueBackgroundColour = [0,0,0,0.5];	//	R,G,B,A
		}
		processVideoElement(this,defaultLanguage,options);
	}
	
	CaptionRenderer.prototype.addTextTrack = function(id,kind,label,language,src,type,isDefault) {
		var newTrack = new TextTrack(
			typeof(id) === "string" ? id : "",
			kind,
			typeof(label) === "string" ? label : "",
			typeof(language) === "string" ? language : "",
			src,
			typeof(isDefault) === "boolean" ? isDefault : false);
		if (newTrack) {
			this.tracks.push(newTrack);
			return newTrack;
		}
		return null;			
	};
	
	CaptionRenderer.prototype.rebuildCaptions = (function(){
		/* styleCueContainer(renderer)
			Styles and positions a div for displaying cues on a video.
		*/
		function styleCueContainer(renderer) {
			var containerObject = renderer.containerObject;
			var containerID = containerObject.id;
			var options = renderer.options;
			var videoElement = renderer.element;
			var videoMetrics, baseFontSize, baseLineHeight;
			
			if (!containerObject.parentNode) {
				((options.appendCueCanvasTo instanceof HTMLElement)
					?options.appendCueCanvasTo
					:document.body).appendChild(containerObject);
			}
		
			// TODO(silvia): we should not really muck with the aria-describedby attribute of the video
			if (String(videoElement.getAttribute("aria-describedby")).indexOf(containerID) === -1) {
				videoElement.setAttribute("aria-describedby",videoElement.hasAttribute("aria-describedby") ? videoElement.getAttribute("aria-describedby") + " " : ""+containerID);
			}
		
			// Set up font metrics
			videoMetrics = getNodeMetrics(videoElement);
			baseFontSize = Math.max(((videoMetrics.height * (options.fontSizeVerticalPercentage/100))/96)*72,options.minimumFontSize);
			baseLineHeight = Math.max(Math.floor(baseFontSize * options.lineHeightRatio),options.minimumLineHeight);
		
			// Style node!
			applyStyles(containerObject,{
				"zIndex": 100,
				"height": (videoMetrics.height - videoMetrics.controlHeight) + "px",
				"width": videoMetrics.width + "px",
				"top": (options.appendCueCanvasTo ? 0 : videoMetrics.top) + "px",
				"left": (options.appendCueCanvasTo ? 0 : videoMetrics.left) + "px",
				"color": "white",
				"fontFamily": "Verdana, Helvetica, Arial, sans-serif",
				"fontSize": baseFontSize + "pt",
				"lineHeight": baseLineHeight + "pt"
			});
		
			renderer.videoMetrics = videoMetrics;
			
			// Defeat a horrid Chrome 10 video bug
			// http://stackoverflow.com/questions/5289854/chrome-10-custom-video-interface-problem/5400438#5400438
			if (window.navigator.userAgent.toLowerCase().indexOf("chrome/10") > -1) {	
				containerObject.style.backgroundColor = "rgba(0,0,0,0.01" + Math.random().toString().replace(".","") + ")";
			}
		}
		return function(dirtyBit) {
			var renderer = this;
			var videoElement = this.element;
			var options = this.options;
			var preprocess = options.preprocess;
			var styleCue = options.styleCue;
			var currentTime = videoElement.currentTime;
			var compositeActiveCues = [];
			var activeCueIDs;

			// Work out what cues are showing...
			this.tracks.forEach(function(track) {
				if (track.mode === TextTrack.SHOWING && track.readyState === TextTrack.LOADED) {
					// Do a reverse sort
					// Since the render area decreases in size with each successive cue added,
					// and we want cues which are older to be displayed above cues which are newer,
					// we sort active cues within each track so that older ones are rendered first.
					[].push.apply(compositeActiveCues,[].slice.call(track.activeCues,0).sort(function(cueA, cueB) {
						return (cueA.startTime > cueB.startTime)? -1 : 1;
					}));
				}
			});
			
			// Determine whether cues have changed - we generate an ID based on track ID, cue ID, and text length
			activeCueIDs = compositeActiveCues.map(function(cue) {return cue.track.id + cue.id + cue.text.toString(currentTime).length;}).join('');
			
			// If they've changed, we re-render our cue canvas.
			if (dirtyBit || activeCueIDs !== this.previousActiveCues) {				
				// Get the canvas ready if it isn't already
				styleCueContainer(this);
				this.containerObject.innerHTML = "";
			
				// Define storage for the available cue area, diminished as further cues are added
				// Cues occupy the largest possible area they can, either by width or height
				// (depending on whether the `direction` of the cue is vertical or horizontal)
				// Cues which have an explicit position set do not detract from this area.
				this.availableCueArea = {
					"bottom": (this.videoMetrics.height-this.videoMetrics.controlHeight),
					"right": this.videoMetrics.width,
					"top": 0,
					"left": 0,
					"height": (this.videoMetrics.height-this.videoMetrics.controlHeight),
					"width": this.videoMetrics.width
				};
			
				// Now we render the cues
				compositeActiveCues.forEach(function(cue) {				
					var cueNode;
					if(cache.hasOwnProperty(cue.uid)){
						cueNode = cache[cue.uid];			
						console.log(cueNode);
					} else {
						cueNode = document.createElement("div");
						if(String(cue.id).length){ cueNode.id = cue.id, cue.uid = cueNode.uid; }
						cueNode.className = "captionator-cue";
						cueNode.innerHTML = preprocess(cue.text.toString(currentTime));	
						cueNode = styleCue(cueNode);
						cache[cue.uid] = cueNode;
					}
					positionCue(cueNode,cue,renderer);
					renderer.containerObject.appendChild(cueNode);
				});
			}
			
			this.previousActiveCues = activeCueIDs;
		}
	}());
	
	return CaptionRenderer;
})();