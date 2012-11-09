/*
	Captionator 0.5.1 [CaptionCrunch]
	Christopher Giffard, 2011
	Share and enjoy

	https://github.com/cgiffard/Captionator
*/
var CaptionRenderer = (function() {
	"use strict";

	/*	positionCue(DOMNode, cueObject, videoNode)
		Styles and positions cue nodes according to the WebVTT specification.
		First parameter: The DOMNode representing the cue to style. This parameter is mandatory.
		Second parameter: The TextTrackCue itself.
		Third Parameter: The HTMLVideoElement with which the cue is associated. This parameter is mandatory.
	*/
	var positionCue = (function(){
		// Function to facilitate vertical text alignments in browsers which do not support writing-mode
		// (sadly, all the good ones!)
		function spanify(DOMNode,fontSize,lineHeight,chars) {
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
							.forEach(function(s){
								if(!s.length){ return; }
								var ch = templateNode.cloneNode(false);
								ch.textContent = s;
								replacementNode.appendChild(ch);
								chars.push(ch)
							});
					currentNode.parentNode.replaceChild(replacementNode,currentNode);
				} else if (DOMNode.childNodes[nodeIndex].nodeType === 1) {
					spanify(DOMNode.childNodes[nodeIndex],fontSize,lineHeight,chars);
				}
			});
			return chars;
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
			var options = renderer.options;
			var videoElement = renderer.element;
			var videoMetrics = renderer.videoMetrics;
			var cueX = 0, cueY = 0, cueWidth = 0, cueHeight = 0, cuePaddingLR = 0, cuePaddingTB = 0;
			var cueSize, cueLine, cueVertical = cueObject.vertical, cueSnap = cueObject.snapToLines, cuePosition = cueObject.position;
			var baseFontSize, basePixelFontSize, baseLineHeight, tmpHeightExclusions;
			var videoHeightInLines, videoWidthInLines, pixelLineHeight, verticalPixelLineHeight;
			var maxCueSize = 100, textBoundingBoxWidth = 0, textBoundingBoxPercentage = 0, autoSize = true;
			var availableCueArea = renderer.availableCueArea;

			if (cueVertical === "") {
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
				
				cuePaddingLR = Math.floor(videoMetrics.width * 0.01);
				cuePaddingTB = 0;
			}else{
				cuePaddingLR = 0;
				cuePaddingTB = Math.floor(videoMetrics.height * 0.01);
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
			if (options.sizeCuesByTextBoundingBox && cueObject.size === 100) {
				// We assume (given a size of 100) that no explicit size was set.
				cueSize = textBoundingBoxPercentage;
			} else {
				cueSize = cueObject.size;
				autoSize = false;
			}
			
			if (cueObject.line === "auto") {
				cueLine = cueVertical === "" ? videoHeightInLines : videoWidthInLines;
			} else {
				cueLine = parseFloat(cueObject.line);
			}
			
			if (cueVertical === "") {
				cueHeight = pixelLineHeight;

				if (autoSize) { // Don't squish the text
					cueSize = (cueSize - cuePosition > textBoundingBoxPercentage)
								?cueSize-cuePosition:textBoundingBoxPercentage;
				}
								
				if (cueSnap) {
					cueY = ((videoHeightInLines-1) * pixelLineHeight) + availableCueArea.top;
					cueWidth = availableCueArea.width * cueSize/100;
				} else {
					tmpHeightExclusions = videoMetrics.controlHeight + pixelLineHeight + (cuePaddingTB*2);
					cueY = (videoMetrics.height - tmpHeightExclusions) * (cueLine/100);
					cueWidth = videoMetrics.width * cueSize/100;
				}
				
				cueX = ((availableCueArea.right - cueWidth) * (cuePosition/100)) + availableCueArea.left;
				
			} else {
				// Basic positioning
				cueHeight = availableCueArea.height * (cueSize/100);
				// Work out CueY taking into account textPosition...
				cueY = ((availableCueArea.bottom - cueHeight) * (cuePosition/100)) + 
						availableCueArea.top;
				
				(function(){	// Split into characters, and continue calculating width & positioning with new info
					var currentLine = 0, characterPosition = 0,
						characters = spanify(DOMNode,basePixelFontSize,verticalPixelLineHeight,[]),
						characterCount = characters.length,
						charactersPerLine = Math.floor((cueHeight-cuePaddingTB*2)/basePixelFontSize),
						lineCount = Math.ceil(characterCount/charactersPerLine),
						finalLineCharacterCount = characterCount - (charactersPerLine * (lineCount - 1)),
						finalLineCharacterHeight = finalLineCharacterCount * basePixelFontSize;
					
					cueWidth = Math.ceil(characterCount/charactersPerLine) * verticalPixelLineHeight;
					
					// Work out CueX taking into account linePosition...
					cueX = cueSnap?(cueVertical === "lr" ? availableCueArea.left : availableCueArea.right - cueWidth)
						:((videoMetrics.width - (cueWidth + (cuePaddingLR * 2))) * (cueVertical === "lr"?cueLine/100:1-cueLine/100));
					
					// Iterate through the characters and position them accordingly...
					characters.forEach(function(characterSpan) {
						var characterY,
							characterX = (cueVertical === "lr")
								?verticalPixelLineHeight * currentLine:cueWidth - (verticalPixelLineHeight * (currentLine+1));
						
						if(currentLine < (lineCount-1)) {
							characterY = (characterPosition * basePixelFontSize) + cuePaddingTB;
						}else switch(cueObject.align){
							case "start":
								characterY = (characterPosition * basePixelFontSize) + cuePaddingTB;
								break;
							case "end":
								characterY = ((characterPosition * basePixelFontSize)-basePixelFontSize) + ((cueHeight+(cuePaddingTB*2))-finalLineCharacterHeight);
								break;
							case "middle":
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
				}());
			}
			
			applyStyles(DOMNode,{
				"position": "absolute",
				"overflow": "hidden",
				"width": cueWidth + "px",
				"height": cueHeight + "px",
				"top": cueY + "px",
				"left": cueX + "px",
				"padding": cuePaddingTB + "px " + cuePaddingLR + "px",
				"textAlign": (cueVertical !== "")?"":
					(checkDirection(String(cueObject.text)) === "rtl"
						?{"start":"right","middle":"center","end":"left"}
						:{"start":"left","middle":"center","end":"right"})[cueObject.align],
				"backgroundColor": "rgba(" + options.cueBackgroundColour.join(",") + ")",
				"direction": checkDirection(String(cueObject.text)),
				"lineHeight": baseLineHeight + "pt",
				"boxSizing": "border-box"
			});
			
			if (cueVertical === "") {
				// Now shift cue up if required to ensure it's all visible
				if (DOMNode.scrollHeight > DOMNode.offsetHeight * 1.2) {
					if (cueSnap) {
						(function(){
							var upwardAjustment = 0;
							while (DOMNode.scrollHeight > DOMNode.offsetHeight * 1.2) {
								cueHeight += pixelLineHeight;
								DOMNode.style.height = cueHeight + "px";
								upwardAjustment ++;
							}
							
							cueY = cueY - (upwardAjustment*pixelLineHeight);
							DOMNode.style.top = cueY + "px";
						}());
					} else {
						// Not working by lines, so instead of shifting up, simply throw out old cueY calculation
						// and completely recalculate its value
						cueHeight = (DOMNode.scrollHeight + cuePaddingTB);
						tmpHeightExclusions = videoMetrics.controlHeight + cueHeight + (cuePaddingTB*2);
						cueY = (videoMetrics.height - tmpHeightExclusions) * (cueLine/100);
						
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
				} else if (availableCueArea.top < cueY + cueHeight) {
					availableCueArea.top = cueY + cueHeight;
				}
				
				availableCueArea.height =
					availableCueArea.bottom - 
					availableCueArea.top;
			} else {
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
			}
		};
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
	
	/* CaptionRenderer([dom element],
						[options - JS Object])
	
		Adds closed captions to video elements. The first, second and third parameter are both optional.
		First parameter: Use an array of either DOMElements or selector strings (compatible with querySelectorAll.)
		All of these elements will be captioned if tracks are available. If this parameter is omitted, all video elements
		present in the DOM will be captioned if tracks are available.
	*/
	function CaptionRenderer(element,options) {
		if(!(this instanceof CaptionRenderer)){ return new CaptionRenderer(element,options); }
		options = options instanceof Object? options : {};
		var media, renderer = this,
			timeupdate = function(){ renderer.currentTime = media.currentTime; },
			internalTime = 0,
			containerObject = document.createElement("div");
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
		
		window.addEventListener("resize", this.rebuildCaptions.bind(this,true) ,false);
		this.bindMediaElement = function(element) {
			media && media.removeEventListener('timeupdate',timeupdate,false);
			media = element;
			media && media.addEventListener('timeupdate',timeupdate,false);
		};
		
		Object.defineProperties(this,{
			currentTime: {
				get: function(){ return internalTime; },
				set: function(time){
					internalTime = +time || 0;
					// update active cues
					try{ this.tracks.forEach(function(track) { track.currentTime = internalTime; }); }
					catch(error) {}
					this.rebuildCaptions(false);
				},
				enumerable: true
			}
		});
	}
	
	CaptionRenderer.prototype.addTextTrack = function(kind,label,language) {
		var newTrack;
		if(kind instanceof TextTrack){
			newTrack = kind;
		}else{
			newTrack = new TextTrack(
			typeof(kind) === "string" ? kind : "",
			typeof(label) === "string" ? label : "",
			typeof(language) === "string" ? language : "");
			newTrack.readyState = TextTrack.LOADED;
		}
		if (newTrack) {
			this.tracks.push(newTrack);
			newTrack.renderer = this;
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
			var options = this.options;
			var preprocess = options.preprocess;
			var styleCue = options.styleCue;
			var currentTime = this.currentTime;
			var compositeActiveCues = [];
			var activeCueIDs;

			// Work out what cues are showing...
			this.tracks.forEach(function(track) {
				if (track.mode === "showing" && track.readyState === TextTrack.LOADED) {
					console.log(track.label,track.currentTime);
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
			render: if (dirtyBit || activeCueIDs !== this.previousActiveCues) {				
				// Get the canvas ready if it isn't already
				styleCueContainer(this);
				this.containerObject.innerHTML = "";
			
				if(!compositeActiveCues.length){ break render; }
			
				// Define storage for the available cue area, diminished as further cues are added
				// Cues occupy the largest possible area they can, either by width or height
				// (depending on whether the `direction` of the cue is vertical or horizontal)
				// Cues which have an explicit position set do not detract from this area.
				this.availableCueArea = {
					"top": 0,
					"left": 0,
					"bottom": (this.videoMetrics.height-this.videoMetrics.controlHeight),
					"right": this.videoMetrics.width,
					"height": (this.videoMetrics.height-this.videoMetrics.controlHeight),
					"width": this.videoMetrics.width
				};
			
				// Now we render the cues
				compositeActiveCues.forEach(function(cue) {
					var cueNode = document.createElement("div");
					if(String(cue.id).length){ cueNode.id = cue.id; }
					cueNode.className = "captionator-cue";
					cueNode.innerHTML = preprocess(cue.text.toString(currentTime));										
					cueNode = styleCue(cueNode);
					positionCue(cueNode,cue,renderer);
					renderer.containerObject.appendChild(cueNode);
				});
			}
			
			this.previousActiveCues = activeCueIDs;
		}
	}());
	
	/* processVideoElement(videoElement <HTMLVideoElement>,
						[options - JS Object])
	*/
	CaptionRenderer.prototype.processVideoElement = function(videoElement,options) {
		options = options instanceof Object? options : {};
		var trackList = this.tracks;
		var renderer = this;
		var language = navigator.language || navigator.userLanguage;
		var defaultLanguage = options.language;
		var globalLanguage = defaultLanguage || language.split("-")[0];
		var enabledDefaultTrack = false;
		var elements = [].slice.call(videoElement.querySelectorAll("track"),0);
		
		if(elements.length === 0){ return; }
		
		elements.forEach(function(trackElement) {
			var trackEnabled = false,
				sources = trackElement.querySelectorAll("source"),
				trackObject = new TextTrack(
							trackElement.getAttribute("kind"),
							trackElement.getAttribute("label"),
							trackElement.getAttribute("srclang").split("-")[0]);
			
			trackObject
			trackObject.loadTrack(sources.length > 0?sources:trackElement.getAttribute("src"));
			
			// Now determine whether the track is visible by default.
			// The comments in this section come straight from the spec...
			trackObject.internalDefault = trackElement.hasAttribute("default");			
			switch(trackObject.kind){
				// If the text track kind is subtitles or captions and the user has indicated an interest in having a track
				// with this text track kind, text track language, and text track label enabled, and there is no other text track
				// in the media element's list of text tracks with a text track kind of either subtitles or captions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "subtitles":
				case "captions": if(options.enableCaptionsByDefault && defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.some(function(track) {
						return	(track.kind === "captions" || track.kind === "subtitles") &&
								defaultLanguage === trackObject.language &&
								trackObject.mode === "showing";
					});
				}break;
				// If the text track kind is chapters and the text track language is one that the user agent has reason to believe is
				// appropriate for the user, and there is no other text track in the media element's list of text tracks with a text track
				// kind of chapters whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "chapters": if (defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.filter(function(track) {
						return track.kind === "chapters" && track.mode === "showing";
					});
				}break;
				// If the text track kind is descriptions and the user has indicated an interest in having text descriptions
				// with this text track language and text track label enabled, and there is no other text track in the media element's
				// list of text tracks with a text track kind of descriptions whose text track mode is showing
				// ---> Let the text track mode be showing.
				case "descriptions": if(options.enableDescriptionsByDefault && defaultLanguage === trackObject.language) {
					trackEnabled = !trackList.filter(function(track) {
						return track.kind === "descriptions" && track.mode === "showing";
					});
				}
			}
		
			// If there is a text track in the media element's list of text tracks whose text track mode is showing by default,
			// the user agent must furthermore change that text track's text track mode to hidden.
			trackEnabled && trackList.forEach(function(track) {
				if(track.internalDefault && trackObject.mode === "showing") {
					trackObject.mode = "hidden";
				}
			});
		
			// If the track element has a default attribute specified, and there is no other text track in the media element's
			// list of text tracks whose text track mode is showing or showing by default
			// Let the text track mode be showing by default.
			trackEnabled |= trackObject.internalDefault && !trackList.some(function(track) {
				return track.mode === "showing";
			});
	
			// Otherwise
			// Let the text track mode be disabled.
			trackObject.mode = trackEnabled?"showing":"disabled";
			trackObject.renderer = renderer;
			trackList.push(trackObject);
		});
		
		this.rebuildCaptions(false);
	};
	
	return CaptionRenderer;
})();