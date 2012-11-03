// As defined by http://www.whatwg.org/specs/web-apps/current-work/multipage/video.html
// Internal cue structure object
function CueStructure(cueSource,options) {
	var cueStructureObject = this;
	this.isTimeDependent = false;
	this.cueSource = cueSource;
	this.options = options;
	this.processedCue = null;
	this.toString = function toString(currentTimestamp) {
		if (options.processCueHTML !== false) {
			var processLayer = function(layerObject,depth) {
				if (cueStructureObject.processedCue === null) {
					var compositeHTML = "", itemIndex, cueChunk;
					for (itemIndex in layerObject) {
						if (itemIndex.match(/^\d+$/) && layerObject.hasOwnProperty(itemIndex)) {
							// We're not a prototype function or local property, and we're in range
							cueChunk = layerObject[itemIndex];
							// Don't generate text from the token if it has no contents
							if (cueChunk instanceof Object && cueChunk.children && cueChunk.children.length) {
								if (cueChunk.token === "v") {
									compositeHTML +="<q data-voice=\"" + cueChunk.voice.replace(/[\"]/g,"") + "\" class='voice " +
													"speaker-" + cueChunk.voice.replace(/[^a-z0-9]+/ig,"-").toLowerCase() + "' " + 
													"title=\"" + cueChunk.voice.replace(/[\"]/g,"") + "\">" +
													processLayer(cueChunk.children,depth+1) +
													"</q>";
								} else if(cueChunk.token === "c") {
									compositeHTML +="<span class='webvtt-class-span " + cueChunk.classes.join(" ") + "'>" +
													processLayer(cueChunk.children,depth+1) +
													"</span>";
								} else if(cueChunk.timeIn > 0) {
									// If a timestamp is unspecified, or the timestamp suggests this token is valid to display, return it
									if ((currentTimestamp === null || currentTimestamp === undefined) ||
										(currentTimestamp > 0 && currentTimestamp >= cueChunk.timeIn)) {
								
										compositeHTML +="<span class='webvtt-timestamp-span' " +
														"data-timestamp='" + cueChunk.token + "' data-timestamp-seconds='" + cueChunk.timeIn + "'>" +
														processLayer(cueChunk.children,depth+1) +
														"</span>";
									}
								} else {
									compositeHTML +=cueChunk.rawToken +
													processLayer(cueChunk.children,depth+1) +
													"</" + cueChunk.token + ">";
								}
							} else if (cueChunk instanceof String || typeof(cueChunk) === "string" || typeof(cueChunk) === "number") {
								compositeHTML += cueChunk;
							} else {
								// Didn't match - file a bug!
							}
						}
					}
					
					if (!cueStructureObject.isTimeDependent && depth === 0) {
						cueStructureObject.processedCue = compositeHTML;
					}
				
					return compositeHTML;
				} else {
					return cueStructureObject.processedCue;
				}
			};
			return processLayer(this,0);
		} else {
			return cueSource;
		}
	};
};
CueStructure.prototype = [];

var TextTrack = (function(){
	var textKinds = {
		// WHATWG SPEC
		"subtitles":true,
		"captions":true,
		"descriptions":true,
		"metadata":true,
		"chapters":true,
		 // CAPTIONATOR TEXT EXTENSIONS
		"karaoke":true,
		"lyrics":true,
		"tickertext":true
	};

	/*	Subclassing DOMException so we can reliably throw it without browser intervention. This is quite hacky. See SO post:
		http://stackoverflow.com/questions/5136727/manually-artificially-throwing-a-domexception-with-javascript
	*/
	function createDOMException(code,message,name) {
		try {
			//	Deliberately cause a DOMException error
			document.querySelectorAll("div/[]");
		} catch(Error) {
			//	Catch it and subclass it
			var CustomDOMException = function CustomDOMException(code,message,name){ this.code = code; this.message = message; this.name = name; };
			CustomDOMException.prototype = Error;
			return new CustomDOMException(code,message,name);
		}
	}
	
	/* parseCaptions(string captionData, object options)
		Accepts and parses caption/subtitle data.
		First parameter: Entire text data (UTF-8) of the retrieved SRT/WebVTT file. This parameter is mandatory. (really - what did
		you expect it was going to do without it!)
		Second parameter: Captionator internal options object. See the documentation for allowed values.
		RETURNS: An array of TextTrackCue Objects in initial state.
	*/
	var parseCaptions = (function(){
		// Set up timestamp parsers - SRT does WebVTT timestamps as well.
		var SUBTimestampParser			= /^(\d{2})?:?(\d{2}):(\d{2})\.(\d+)\,(\d{2})?:?(\d{2}):(\d{2})\.(\d+)\s*(.*)/;
		var SBVTimestampParser			= /^(\d+)?:?(\d{2}):(\d{2})\.(\d+)\,(\d+)?:?(\d{2}):(\d{2})\.(\d+)\s*(.*)/;
		var SRTTimestampParser			= /^(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)\s+\-\-\>\s+(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)\s*(.*)/;
		var SRTChunkTimestampParser		= /(\d{2})?:?(\d{2}):(\d{2})[\.\,](\d+)/;
		var GoogleTimestampParser		= /^([\d\.]+)\s+\+([\d\.]+)\s*(.*)/;
		var LRCTimestampParser			= /^\[(\d{2})?:?(\d{2})\:(\d{2})\.(\d{2})\]\s*(.*?)$/i;
		var WebVTTDEFAULTSCueParser		= /^DEFAULTS?\s+\-\-\>\s+(.*)/g;
		var WebVTTSTYLECueParser		= /^STYLES?\s+\-\-\>\s*\n([\s\S]*)/g;
		var WebVTTCOMMENTCueParser		= /^COMMENTS?\s+\-\-\>\s+(.*)/g;
		
		function hasRealTextContent(textInput) {
			return !!textInput.replace(/[^a-z0-9]+/ig,"").length;
		}
		
		function processCaptionHTML(inputHTML,options) {
			var cueStructure = new CueStructure(inputHTML,options),
				currentContext = cueStructure,
				stack = [];
			
			// Process out special cue spans
			inputHTML
				.split(/(<\/?[^>]+>)/ig)
				.filter(function(cuePortionText) {
					return !!cuePortionText.replace(/\s*/ig,"");
				}).forEach(function(currentToken,splitIndex) {
				var TagName, tmpObject,
					stackIndex, stackScanDepth, parentContext,
					chunkTimestamp, timeData;
					
				if (currentToken[0] === "<") {
					if (currentToken[1] === "/") {
						// Closing tag
						TagName = currentToken.substr(2).split(/[\s>]+/g)[0];
						if (stack.length > 0) {
							// Scan backwards through the stack to determine whether we've got an open tag somewhere to close.
							var stackScanDepth = 0;
							for (stackIndex = stack.length-1; stackIndex >= 0; stackIndex --) {
								parentContext = stack[stackIndex][stack[stackIndex].length-1];
								stackScanDepth = stackIndex;
								if (parentContext.token === TagName) { break; }
							}
						
							currentContext = stack[stackScanDepth];
							stack = stack.slice(0,stackScanDepth);
						} else {
							// Tag mismatch!
						}
					} else {
						// Opening Tag
						// Check whether the tag is valid according to the WebVTT specification
						// If not, don't allow it (unless the sanitiseCueHTML option is explicitly set to false)
					
						if (options.sanitiseCueHTML	|| (
								currentToken.substr(1).match(SRTChunkTimestampParser)	||
								currentToken.match(/^<v\s+[^>]+>/i)						||
								currentToken.match(/^<c[a-z0-9\-\_\.]+>/)				||
								currentToken.match(/^<(b|i|u|ruby|rt)>/)
							)) {
							
							tmpObject = {
								"token":	currentToken.replace(/[<\/>]+/ig,"").split(/[\s\.]+/)[0],
								"rawToken":	currentToken,
								"children":	[]
							};
							
							if (tmpObject.token === "v") {
								tmpObject.voice = currentToken.match(/^<v\s*([^>]+)>/i)[1];
							} else if (tmpObject.token === "c") {
								tmpObject.classes = currentToken
														.replace(/[<\/>\s]+/ig,"")
														.split(/[\.]+/ig)
														.slice(1)
														.filter(hasRealTextContent);
							} else if (!!(chunkTimestamp = tmpObject.rawToken.match(SRTChunkTimestampParser))) {
								cueStructure.isTimeDependent = true;
								timeData = chunkTimestamp.slice(1);
								tmpObject.timeIn =	parseInt((timeData[0]||0) * 60 * 60,10) +	// Hours
													parseInt((timeData[1]||0) * 60,10) +		// Minutes
													parseInt((timeData[2]||0),10) +				// Seconds
													parseFloat("0." + (timeData[3]||0));		// MS
							}
						
							currentContext.push(tmpObject);
							stack.push(currentContext);
							currentContext = tmpObject.children;
						}
					}
				} else {
					// Text string
					if (options.sanitiseCueHTML !== false) {
						currentToken = currentToken
										.replace(/</g,"&lt;")
										.replace(/>/g,"&gt;")
										.replace(/\&/g,"&amp;");
						
						if (!options.ignoreWhitespace) {
							currentToken = currentToken.replace(/\n+/g,"<br />");
						}
					}
				
					currentContext.push(currentToken);
				}
			});

			return cueStructure;
		}
		
		return function(captionData, options) {
			options = options instanceof Object ? options : {};
			var fileType = "", subtitles = [];
			var cueStyles = "";
			var cueDefaults = [];

			if (!captionData) {
				throw new Error("Required parameter captionData not supplied.");
			}
			
			// This function takes chunks of text representing cues, and converts them into cue objects.
			function parseCaptionChunk(subtitleElement,objectCount) {
				var subtitleParts, timeIn, timeOut, html, timeData, subtitlePartIndex, cueSettings = "", id, specialCueData;
				var timestampMatch, tmpCue;

				// WebVTT Special Cue Logic
				if ((specialCueData = WebVTTDEFAULTSCueParser.exec(subtitleElement))) {
					cueDefaults = specialCueData.slice(2).join("");
					cueDefaults = cueDefaults.split(/\s+/g).filter(function(def) { return def && !!def.length; });
					return null;
				} else if ((specialCueData = WebVTTSTYLECueParser.exec(subtitleElement))) {
					cueStyles += specialCueData[specialCueData.length-1];
					return null;
				} else if ((specialCueData = WebVTTCOMMENTCueParser.exec(subtitleElement))) {
					return null; // At this stage, we don't want to do anything with these.
				}
				
				if (fileType === "LRC") {
					subtitleParts = [
						subtitleElement.substr(0,subtitleElement.indexOf("]")),
						subtitleElement.substr(subtitleElement.indexOf("]")+1)
					];
				} else {
					subtitleParts = subtitleElement.split(/\n/g);
				}
			
				// Trim off any blank lines (logically, should only be max. one, but loop to be sure)
				while (!subtitleParts[0].replace(/\s+/ig,"").length && subtitleParts.length > 0) {
					subtitleParts.shift();
				}
			
				if (subtitleParts[0].match(/^\s*[a-z0-9]+\s*$/ig)) {
					// The identifier becomes the cue ID (when *we* load the cues from file. Programatically created cues can have an ID of whatever.)
					id = String(subtitleParts.shift().replace(/\s*/ig,""));
				} else { id = objectCount; }
			
				for (subtitlePartIndex = 0; subtitlePartIndex < subtitleParts.length; subtitlePartIndex ++) {
					var timestamp = subtitleParts[subtitlePartIndex];
					
					if ((timestampMatch = SRTTimestampParser.exec(timestamp)) ||
						(timestampMatch = SUBTimestampParser.exec(timestamp)) ||
						(timestampMatch = SBVTimestampParser.exec(timestamp))) {
						
						// WebVTT / SRT / SUB (VOBSub) / YouTube SBV style timestamp
						
						timeData = timestampMatch.slice(1);
						
						timeIn =	parseInt((timeData[0]||0) * 60 * 60,10) +	// Hours
									parseInt((timeData[1]||0) * 60,10) +		// Minutes
									parseInt((timeData[2]||0),10) +				// Seconds
									parseFloat("0." + (timeData[3]||0));		// MS
						
						timeOut =	parseInt((timeData[4]||0) * 60 * 60,10) +	// Hours
									parseInt((timeData[5]||0) * 60,10) +		// Minutes
									parseInt((timeData[6]||0),10) +				// Seconds
									parseFloat("0." + (timeData[7]||0));		// MS
						
						if (timeData[8]) {
							cueSettings = timeData[8];
						}
				
					} else if (!!(timestampMatch = GoogleTimestampParser.exec(timestamp))) {
						// Google's proposed WebVTT timestamp style
						timeData = timestampMatch.slice(1);
						timeIn = parseFloat(timeData[0]);
						timeOut = timeIn + parseFloat(timeData[1]);
						if (timeData[2]) { cueSettings = timeData[2]; }
					}
					
					// We've got the timestamp - return all the other unmatched lines as the raw subtitle data
					subtitleParts = subtitleParts.slice(0,subtitlePartIndex).concat(subtitleParts.slice(subtitlePartIndex+1));
					break;
				}

				if (!timeIn && !timeOut) { return null; } // Cue is invalid!

				// Consolidate cue settings, convert defaults to object
				var compositeCueSettings =
					cueDefaults
						.reduce(function(previous,current,index,array){
							previous[current.split(":")[0]] = current.split(":")[1];
							return previous;
						},{});
				
				// Loop through cue settings, replace defaults with cue specific settings if they exist
				compositeCueSettings =
					cueSettings
						.split(/\s+/g)
						.filter(function(set) { return set && !!set.length; })
						// Convert array to a key/val object
						.reduce(function(previous,current,index,array){
							previous[current.split(":")[0]] = current.split(":")[1];
							return previous;
						},compositeCueSettings);
				
				// Turn back into string like the TextTrackCue constructor expects
				cueSettings = "";
				for (var key in compositeCueSettings) {
					if (compositeCueSettings.hasOwnProperty(key)) {
						cueSettings += !!cueSettings.length ? " " : "";
						cueSettings += key + ":" + compositeCueSettings[key];
					}
				}
				
				// The remaining lines are the subtitle payload itself (after removing an ID if present, and the time);
				tmpCue = new TextTrackCue(id, timeIn, timeOut, subtitleParts.join("\n"), cueSettings, false, null);
				tmpCue.styleData = cueStyles;
				return tmpCue;
			}
			
			// Begin parsing --------------------
			subtitles = captionData
							.replace(/\r\n/g,"\n")
							.replace(/\r/g,"\n");
		
			if (LRCTimestampParser.exec(captionData)) {
				// LRC file... split by single line
				subtitles = subtitles.split(/\n+/g);
				fileType = "LRC";
			} else {
				subtitles = subtitles.split(/\n\n+/g);
			}
		
			subtitles = subtitles.filter(function(lineGroup) {
								if (lineGroup.match(/^WEBVTT(\s*FILE)?/ig)) {
									fileType = "WebVTT";
									return false;
								} else {
									if (lineGroup.replace(/\s*/ig,"").length) {
										return true;
									}
									return false;
								}
							})
							.map(parseCaptionChunk)
							// In the parseCaptionChunk function, we return null for special and malformed cues,
							// and cues we want to ignore, rather than expose to JS. Filter these out now.
							.filter(function(cue) { return cue !== null; });
			
			if(options.processCueHTML !== false){
				subtitles.forEach(function(cue){
					cue.text = processCaptionHTML(cue.text,options);
				});
			}
			
			return subtitles;
		}
	}());
		
	function TextTrack(id,kind,label,language,trackSource,isDefault) {
		var internalMode = TextTrack.OFF,
			internalDefault = isDefault || false,
			currentTime = 0;
			
		// If the kind isn't known, throw DOM syntax error exception
		if(!textKinds.hasOwnProperty(kind)){
			throw createDOMException(12,"DOMException 12: SYNTAX_ERR: You must use a valid kind when creating a TimedTextTrack.","SYNTAX_ERR");
		}
		
		this.id = id || "";
		this.cues = new TextTrackCueList(this);
		this.activeCues = new ActiveTextTrackCueList(this.cues,this);
		this.kind = kind || "subtitles";
		this.label = label || "";
		this.language = language || "";
		this.src = trackSource || "";
		this.readyState = TextTrack.NONE;
		this.renderer = null;
	
		this.getMode = function() { return internalMode; };
		this.getDefault = function() { return internalDefault; };
		this.getCurrentTime = function(){ return currentTime; };
	
		this.setMode = function(value) {
			var allowedModes = [TextTrack.OFF,TextTrack.HIDDEN,TextTrack.SHOWING], containerID, container;
			if (allowedModes.indexOf(value) !== -1) {
				if (value !== internalMode) {
					internalMode = value;
			
					if (this.readyState === TextTrack.NONE && this.src.length > 0 && value > TextTrack.OFF) {
						this.loadTrack(this.src,null);
					}
					
					// Refresh all captions on video
					this.renderer && this.renderer.rebuildCaptions(true);
				}
			} else {
				throw new Error("Illegal mode value for track: " + value);
			}
		};
	
		this.setCurrentTime = function(val){
			currentTime = val;
			this.activeCues.refreshCues();
		};
	
		Object.defineProperties(this,{
			mode: {get: this.getMode, set: this.setMode},
			currentTime: {get: this.getCurrentTime, set: this.setCurrentTime},
			"default": {get: this.getDefault}
		});
	}
	
	// Define constants for TextTrack.readyState
	TextTrack.NONE = 0;
	TextTrack.LOADING = 1;
	TextTrack.LOADED = 2;
	TextTrack.ERROR = 3;
	// Define constants for TextTrack.mode
	TextTrack.OFF = 0;
	TextTrack.HIDDEN = 1;
	TextTrack.SHOWING = 2;
	
	TextTrack.prototype.onload = function () {};
	TextTrack.prototype.onerror = function() {};
	TextTrack.prototype.oncuechange = function() {};
	// mutableTextTrack.addCue(cue)
	// Adds the given cue to mutableTextTrack's text track list of cues.
	// Raises an exception if the argument is null, associated with another text track, or already in the list of cues.
	TextTrack.prototype.addCue = function(cue) {
		if (cue && cue instanceof TextTrackCue) {
			this.cues.addCue(cue);
		} else {
			throw new Error("The argument is null or not an instance of TextTrackCue.");
		}
	};
	// mutableTextTrack.removeCue(cue)
	// Removes the given cue from mutableTextTrack's text track list of cues.
	// Raises an exception if the argument is null or not in the list of cues.
	TextTrack.prototype.removeCue = function() {
	
	};
	TextTrack.prototype.loadTrack = (function(){
		function loadTrackReadyState(trackElement, callback, eventData) {
			var captionData;
			if (this.readyState === 4) {
				if(this.status === 200) {
					var TrackProcessingOptions = trackElement.renderer.options || {};
					if (trackElement.kind === "metadata") {
						// People can load whatever data they please into metadata tracks.
						// Don't process it.
						TrackProcessingOptions.processCueHTML = false;
						TrackProcessingOptions.sanitiseCueHTML = false;
					}
					
					captionData = parseCaptions(this.responseText,TrackProcessingOptions);
					trackElement.readyState = TextTrack.LOADED;
					trackElement.cues.loadCues(captionData);
					trackElement.activeCues.refreshCues.apply(trackElement.activeCues);
					trackElement.renderer.rebuildCaptions(true);
					trackElement.onload.call(this);
				
					if (callback instanceof Function) {
						callback.call(trackElement,captionData);
					}
				} else {
					// Throw error handler, if defined
					trackElement.readyState = TextTrack.ERROR;
					trackElement.onerror();
				}
			}
		}
		return function(source, callback) {
			var ajaxObject = new XMLHttpRequest();
			if (this.readyState === TextTrack.LOADED) {
				if (callback instanceof Function) { callback(captionData); }
				return;
			}
			this.src = source;
			this.readyState = TextTrack.LOADING;
			ajaxObject.open('GET', source, true);
			ajaxObject.onreadystatechange = loadTrackReadyState.bind(ajaxObject, this, callback);
			try {
				ajaxObject.send(null);
			} catch(err) {
				// Throw error handler, if defined
				this.readyState = TextTrack.ERROR;
				this.onerror(err);
			}
		};
	}());
	
	return TextTrack;
}());

// Define read-only properties
var TextTrackCueList = (function(){
	function TextTrackCueList(track) {
		this.track = track instanceof TextTrack ? track : null;
	}
	TextTrackCueList.prototype = [];
	TextTrackCueList.prototype.getCueById = function(cueID) {
		return this.filter(function(currentCue) {
			return currentCue.id === cueID;
		})[0];
	};
	TextTrackCueList.prototype.loadCues = function(cueData) {
		for (var cueIndex = 0; cueIndex < cueData.length; cueIndex ++) {
			cueData[cueIndex].track = this.track;
			Array.prototype.push.call(this,cueData[cueIndex]);
		}
	};
	TextTrackCueList.prototype.addCue = function(cue) {
		if (cue && cue instanceof TextTrackCue) {
			if (cue.track === this.track || !cue.track) {
				// TODO: Check whether cue is already in list of cues.
				// TODO: Sort cue list based on TextTrackCue.startTime.
				Array.prototype.push.call(this,cue);
			} else {
				throw new Error("This cue is associated with a different track!");
			}
		} else {
			throw new Error("The argument is null or not an instance of TextTrackCue.");
		}
	};
	TextTrackCueList.prototype.toString = function() { return "[TextTrackCueList]"; };
	return TextTrackCueList;
}());

var ActiveTextTrackCueList = (function(){
	function ActiveTextTrackCueList(textTrackCueList,textTrack) {
		// Among active cues:
	
		// The text track cues of a media element's text tracks are ordered relative to each
		// other in the text track cue order, which is determined as follows: first group the
		// cues by their text track, with the groups being sorted in the same order as their
		// text tracks appear in the media element's list of text tracks; then, within each
		// group, cues must be sorted by their start time, earliest first; then, any cues with
		// the same start time must be sorted by their end time, earliest first; and finally,
		// any cues with identical end times must be sorted in the order they were created (so
		// e.g. for cues from a WebVTT file, that would be the order in which the cues were
		// listed in the file).

		this.refreshCues = function() {
			if (textTrackCueList.length) {
				var cueList = this;
				var cueListChanged = false;
				var oldCueList = [].slice.call(this,0);
				this.length = 0;
				
				textTrackCueList.forEach(function(cue) {
					if (cue.active) {
						cueList.push(cue);

						if (cueList[cueList.length-1] !== oldCueList[cueList.length-1]) {
							cueListChanged = true;
						}
					}
				});

				if (cueListChanged) {
					try {
						textTrack.oncuechange();
					} catch(error){}
				}
			}
		};	
		this.refreshCues();
	};
	ActiveTextTrackCueList.prototype = new TextTrackCueList(null);
	ActiveTextTrackCueList.prototype.toString = function() { return "[ActiveTextTrackCueList]"; };
	return ActiveTextTrackCueList;
}());

var TextTrackCue = (function(){
	function TextTrackCue(id, startTime, endTime, text, settings, pauseOnExit, track) {
		var wasActive = false;
		this.id = id;
		this.track = track instanceof TextTrack ? track : null;
		this.startTime = parseFloat(startTime);
		this.endTime = parseFloat(endTime);
		this.text = typeof(text) === "string" || text instanceof CueStructure ? text : "";
		this.settings = typeof(settings) === "string" ? settings : "";
		this.intSettings = {};
		this.pauseOnExit = !!pauseOnExit;

		// Parse settings & set up cue defaults

		// A writing direction, either horizontal, vertical growing left, or vertical growing right
		// Values: horizontal, vertical, vertical-lr
		this.direction = "horizontal";

		// A boolean indicating whether the position is a line number or a percentage
		this.snapToLines = true;

		// Either a number giving the position of the lines of the cue, or the special value auto
		this.linePosition = "auto";

		// The position of the text of the cue within each line as a percentage
		// of the video, as defined by the writing direction.
		this.textPosition = 50;

		// The size of the box within which the text of each line of the cue is to be aligned
		// as a percentage of the video, as defined by the writing direction.
		this.size = 0;

		// An alignment for the text of each line of the cue.
		// Which sides are the start and end sides depends on the
		// Unicode bidirectional algorithm and the writing direction. [BIDI]
		// Values: start, middle, end
		this.alignment = "middle";

		// Parse VTT Settings...
		if (this.settings.length) {
			var intSettings = this.intSettings;
			var currentCue = this;
			settings = settings.split(/\s+/).filter(function(settingItem) { return settingItem.length > 0;});
			if (settings instanceof Array) {
				settings.forEach(function(cueItem) {
					var settingMap = {"D":"direction","L":"linePosition","T":"textPosition","A":"alignment","S":"size"};
					cueItem = cueItem.split(":");
					if (settingMap[cueItem[0]]) {
						intSettings[settingMap[cueItem[0]]] = cueItem[1];
					}
				
					if (settingMap[cueItem[0]] in currentCue) {
						currentCue[settingMap[cueItem[0]]] = cueItem[1];
					}
				});
			}
		}
		
		this.snapToLines = !this.linePosition.match(/\%/);

		this.isActive = function() {
			var currentTime,
				track = this.track;
			if (track instanceof TextTrack) {
				if ((track.mode === TextTrack.SHOWING || track.mode === TextTrack.HIDDEN) && track.readyState === TextTrack.LOADED) {
					try {
						currentTime = track.currentTime;
						if (this.startTime <= currentTime && this.endTime >= currentTime) {
							// Fire enter event if we were not active and now are
							if (!wasActive) {
								wasActive = true;
								this.onenter();
							}

							return true;
						}
					} catch(Error) {
						return false;
					}
				}
			}
			
			// Fire exit event if we were active and now are not
			if (wasActive) {
				wasActive = false;
				this.onexit();
			}

			return false;
		};

		Object.defineProperties(this,{
			active: {get: this.isActive}
		});
	};
	TextTrackCue.prototype.toString = function toString() {
		return "TextTrackCue:" + this.id + "\n" + String(this.text);
	};
	// Events defined by spec
	TextTrackCue.prototype.onenter = function() {};
	TextTrackCue.prototype.onexit = function() {};
	// Functions defined by spec (getters, kindof)
	TextTrackCue.prototype.getCueAsSource = function getCueAsSource() {
		// Choosing the below line instead will mean that the raw, unprocessed source will be returned instead.
		// Not really sure which is the correct behaviour.
		// return this.text instanceof CueStructure? this.text.cueSource : this.text;
		return String(this.text);
	};
	TextTrackCue.prototype.getCueAsHTML = function getCueAsHTML() {
		var DOMFragment = document.createDocumentFragment();
		var DOMNode = document.createElement("div");
		DOMNode.innerHTML = String(this.text);
		
		Array.prototype.forEach.call(DOMNode.childNodes,function(child) {
			DOMFragment.appendChild(child.cloneNode(true));
		});
	
		return DOMFragment;
	};
	
	return TextTrackCue;
}());