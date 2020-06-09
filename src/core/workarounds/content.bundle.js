'use strict';

/**
 * get JSON file as object from url
 * returns a promise which is fulfilled with the json object as a parameter
 * otherwise it's rejected
 * request url needs permissions in the addon manifest
 **/


/**
 * check if variable is an object
 * from https://stackoverflow.com/a/37164538/3771196
 **/
function isObject (item) {
  return (item && typeof item === 'object' && !Array.isArray(item));
}


/**
 * clone a serializeable javascript object
 **/
function cloneObject (obj) {
  return JSON.parse(JSON.stringify(obj));
}


/**
 * calculates and returns the distance
 * between to points
 **/
function getDistance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}


/**
 * converts a pressed button value to its trigger button equivalent
 * returns -1 if the value cannot be converted
 **/
function toSingleButton (pressedButton) {
  if (pressedButton === 1) return 0;
  else if (pressedButton === 2) return 2;
  else if (pressedButton === 4) return 1;
  else return -1;
}


/**
 * returns the selected text, if no text is selected it will return an empty string
 * inspired by https://stackoverflow.com/a/5379408/3771196
 **/
function getTextSelection () {
  // get input/textfield text selection
  if (document.activeElement &&
      typeof document.activeElement.selectionStart === 'number' &&
      typeof document.activeElement.selectionEnd === 'number') {
        return document.activeElement.value.slice(
          document.activeElement.selectionStart,
          document.activeElement.selectionEnd
        );
  }
  // get normal text selection
  return window.getSelection().toString();
}


/**
 * returns all available data of the given target
 * this data is necessary for some commands
 **/
function getTargetData (target) {
	const data = {};

	data.target = {
		src: target.currentSrc || target.src || null,
		title: target.title || null,
		alt: target.alt || null,
		textContent: target.textContent.trim(),
		nodeName: target.nodeName
  };

  // get closest link
  const link = target.closest("a, area");
	if (link) {
		data.link = {
			href: link.href || null,
			title: link.title || null,
			textContent: link.textContent.trim()
		};
	}

	data.textSelection = getTextSelection();

	return data;
}


/**
 * returns the closest html parent element that matches the conditions of the provided test function or null
 **/
function getClosestElement (startNode, testFunction) {
  let node = startNode;
	while (node !== null && !testFunction(node)) {
    node = node.parentElement;
  }
	return node;
}


/**
 * Smooth scrolling to a given y position
 * duration: scroll duration in milliseconds; default is 0 (no transition)
 * element: the html element that should be scrolled; default is the main scrolling element
 **/
function scrollToY (y, duration = 0, element = document.scrollingElement) {
	// clamp y position between 0 and max scroll position
  y = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, y));

  // cancel if already on target position
  if (element.scrollTop === y) return;

  const cosParameter = (element.scrollTop - y) / 2;
  let scrollCount = 0, oldTimestamp = null;

  function step (newTimestamp) {
    if (oldTimestamp !== null) {
      // if duration is 0 scrollCount will be Infinity
      scrollCount += Math.PI * (newTimestamp - oldTimestamp) / duration;
      if (scrollCount >= Math.PI) return element.scrollTop = y;
      element.scrollTop = cosParameter + y + cosParameter * Math.cos(scrollCount);
    }
    oldTimestamp = newTimestamp;
    window.requestAnimationFrame(step);
  }
  window.requestAnimationFrame(step);
}


/**
 * checks if the current window is framed or not
 **/
function isEmbededFrame () {
  try {
    return window.self !== window.top;
  }
  catch (e) {
    return true;
  }
}


/**
 * checks if an element has a vertical scrollbar
 **/
function isScrollableY (element) {
	const style = window.getComputedStyle(element);
	return !!(element.scrollTop || (++element.scrollTop && element.scrollTop--)) &&
				 style["overflow"] !== "hidden" && style["overflow-y"] !== "hidden";
}


/**
 * checks if the given element is a writable input element
 **/
function isEditableInput (element) {
  const editableInputTypes = ["text", "textarea", "password", "email", "number", "tel", "url", "search"];
  return (
    (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')
    && (!element.type || editableInputTypes.includes(element.type))
    && !element.disabled
    && !element.readOnly
  );
}

/**
 * This class is a wrapper of the native storage API in order to allow synchronous config calls.
 * It also allows loading an optional default configuration which serves as a fallback if the property isn't stored in the user configuration.
 * The config manager should only be used after the config has been loaded.
 * This can be checked via the Promise returned by ConfigManagerInstance.loaded property.
 **/
class ConfigManager {

  /**
   * The constructor of the class requires a storage area as a string.
   * For the first parameter either "local" or "sync" is allowed.
   * An URL to a JSON formatted file can be passed optionally. The containing properties will be treated as the defaults.
   **/
  constructor (storageArea, defaultsURL) {
    if (storageArea !== "local" && storageArea !== "sync") {
      throw "The first argument must be a storage area in form of a string containing either local or sync.";
    }
    if (typeof defaultsURL !== "string" && defaultsURL !== undefined) {
      throw "The second argument must be an URL to a JSON file.";
    }

    this._storageArea = storageArea;
    // empty object as default value so the config doesn't have to be loaded
    this._storage = {};
    this._defaults = {};

    const fetchResources = [ browser.storage[this._storageArea].get() ];
    if (typeof defaultsURL === "string") {
      const defaultsObject = new Promise((resolve, reject) => {
        fetch(defaultsURL, {mode:'same-origin'})
          .then(res => res.json())
          .then(obj => resolve(obj), err => reject(err));
       });
      fetchResources.push( defaultsObject );
    }
    // load ressources
    this._loaded = Promise.all(fetchResources);
    // store ressources when loaded
    this._loaded.then((values) => {
      if (values[0]) this._storage = values[0];
      if (values[1]) this._defaults = values[1];
    });

    // holds all custom event callbacks
    this._events = {
      'change': new Set()
    };
    // defines if the storage should be automatically loaded und updated on storage changes
    this._autoUpdate = false;
    // setup on storage change handler
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === this._storageArea) {
        // automatically update config if defined
        if (this._autoUpdate === true) {
          for (let property in changes) {
            this._storage[property] = changes[property].newValue;
          }
        }
        // execute event callbacks
        this._events["change"].forEach((callback) => callback(changes));
      }
    });
  }


  /**
   * Expose the "is loaded" Promise
   * This enables the programmer to check if the config has been loaded and run code on load
   * get, set, remove calls should generally called after the config has been loaded otherwise they'll have no effect or return undefined
   **/
  get loaded () {
    return this._loaded;
  }


  /**
   * Retuns the value of the given storage path
   * A Storage path is constructed of one or more nested JSON keys concatenated with dots or an array of nested JSON keys
   * If the storage path is left the current storage object is returned
   * If the storage path does not exist in the config or the function is called before the config has been loaded it will return undefined
   **/
  get (storagePath = []) {
    if (typeof storagePath === "string") storagePath = storagePath.split('.');
    else if (!Array.isArray(storagePath)) {
      throw "The first argument must be a storage path either in the form of an array or a string concatenated with dots.";
    }

    const pathWalker = (obj, key) => isObject(obj) ? obj[key] : undefined;
    let entry = storagePath.reduce(pathWalker, this._storage);
    // try to get the default value
    if (entry === undefined) entry = storagePath.reduce(pathWalker, this._defaults);
    if (entry !== undefined) return cloneObject(entry);

    return undefined;
  }


  /**
   * Sets the value of a given storage path and creates the JSON keys if not available
   * If only one value of type object is passed the object keys will be stored in the config and existing keys will be overwriten
   * Retuns the storage set promise which resolves when the storage has been written successfully
   **/
  set (storagePath, value) {
    if (typeof storagePath === "string") storagePath = storagePath.split('.');
    // if only one argument is given and it is an object use this as the new config and override the old one
    else if (arguments.length === 1 && isObject(arguments[0])) {
      this._storage = cloneObject(arguments[0]);
      return browser.storage[this._storageArea].set(this._storage);
    }
    else if (!Array.isArray(storagePath)) {
      throw "The first argument must be a storage path either in the form of an array or a string concatenated with dots.";
    }

    if (storagePath.length > 0) {
      let entry = this._storage;
      const lastIndex = storagePath.length - 1;

      for (let i = 0; i < lastIndex; i++) {
        const key = storagePath[i];
        if (!entry.hasOwnProperty(key) || !isObject(entry[key])) {
          entry[key] = {};
        }
        entry = entry[key];
      }
      entry[ storagePath[lastIndex] ] = cloneObject(value);
      // save to storage
      return browser.storage[this._storageArea].set(this._storage);
    }
  }


  /**
   * Removes the key and value of a given storage path
   * Default values will not be removed, so get() may still return a default value even if removed was called before
   * Retuns the storage set promise which resolves when the storage has been written successfully
   **/
  remove (storagePath) {
    if (typeof storagePath === "string") storagePath = storagePath.split('.');
    else if (!Array.isArray(storagePath)) {
      throw "The first argument must be a storage path either in the form of an array or a string concatenated with dots.";
    }

    if (storagePath.length > 0) {
      let entry = this._storage;
      const lastIndex = storagePath.length - 1;

      for (let i = 0; i < lastIndex; i++) {
        const key = storagePath[i];
        if (entry.hasOwnProperty(key) && isObject(entry[key])) {
          entry = entry[key];
        }
        else return;
      }
      delete entry[ storagePath[lastIndex] ];

      return browser.storage[this._storageArea].set(this._storage);
    }
  }


  /**
   * Clears the entire config
   * If a default config is specified this is equal to resetting the config
   * Retuns the storage clear promise which resolves when the storage has been written successfully
   **/
  clear () {
    return browser.storage[this._storageArea].clear();
  }


  /**
   * Adds an event listener
   * Requires an event specifier as a string and a callback method
   * Current events are:
   * "change" - Fires when the storage has been changed
   **/
  addEventListener (event, callback) {
    if (!this._events.hasOwnProperty(event)) {
      throw "The first argument is not a valid event.";
    }
    if (typeof callback !== "function") {
      throw "The second argument must be a function.";
    }
    this._events[event].add(callback);
  }


  /**
   * Checks if an event listener exists
   * Requires an event specifier as a string and a callback method
   **/
  hasEventListener (event, callback) {
    if (!this._events.hasOwnProperty(event)) {
      throw "The first argument is not a valid event.";
    }
    if (typeof callback !== "function") {
      throw "The second argument must be a function.";
    }
    this._events[event].has(callback);
  }


  /**
   * Removes an event listener
   * Requires an event specifier as a string and a callback method
   **/
  removeEventListener (event, callback) {
    if (!this._events.hasOwnProperty(event)) {
      throw "The first argument is not a valid event.";
    }
    if (typeof callback !== "function") {
      throw "The second argument must be a function.";
    }
    this._events[event].remove(callback);
  }


  /**
   * Setter for the autoUpdate value
   * If autoUpdate is set to true the cached config will automatically update itself on storage changes
   **/
  set autoUpdate (value) {
    this._autoUpdate = Boolean(value);
  }


  /**
   * Getter for the autoUpdate value
   * If autoUpdate is set to true the cached config will automatically update itself on storage changes
   **/
  get autoUpdate () {
    return this._autoUpdate;
  }
}

// global static variables

const LEFT_MOUSE_BUTTON = 1;
const RIGHT_MOUSE_BUTTON = 2;
const MIDDLE_MOUSE_BUTTON = 4;

const PASSIVE = 0;
const PENDING = 1;
const ACTIVE = 2;
const ABORTED = 3;


/**
 * MouseGestureController "singleton"
 * provides 4 events: on start, update, abort and end
 * events can be added via addEventListener and removed via removeEventListener
 * on default the controller is disabled and must be enabled via enable()
 * cancel() can be called to abort/reset the controller
 **/

// public methods and variables


var MouseGestureController = {
  enable: enable,
  disable: disable,
  cancel: cancel,
  addEventListener: addEventListener,
  hasEventListener: hasEventListener,
  removeEventListener: removeEventListener,

  get targetElement () {
    return targetElement;
  },
  set targetElement (value) {
    targetElement = value;
  },

  get mouseButton () {
    return mouseButton;
  },
  set mouseButton (value) {
    mouseButton = Number(value);
  },

  get suppressionKey () {
    return suppressionKey;
  },
  set suppressionKey (value) {
    suppressionKey = value;
  },

  get distanceThreshold () {
    return distanceThreshold;
  },
  set distanceThreshold (value) {
    distanceThreshold = Number(value);
  },

  get timeoutActive () {
    return timeoutActive;
  },
  set timeoutActive (value) {
    timeoutActive = Boolean(value);
  },

  get timeoutDuration () {
    // convert milliseconds back to seconds
    return timeoutDuration / 1000;
  },
  set timeoutDuration (value) {
    // convert seconds to milliseconds
    timeoutDuration = Number(value) * 1000;
  },
};


/**
 * Add callbacks to the given events
 **/
function addEventListener (event, callback) {
  // if event exists add listener (duplicates won't be added)
  if (event in events) events[event].add(callback);
}

/**
 * Check if an event listener is registered
 **/
function hasEventListener (event, callback) {
  // if event exists check for listener
  if (event in events) events[event].has(callback);
}

/**
 * Remove callbacks from the given events
 **/
function removeEventListener (event, callback) {
  // if event exists remove listener
  if (event in events) events[event].delete(callback);
}

/**
 * Add the event listeners to detect a gesture start
 **/
function enable () {
  targetElement.addEventListener('pointerdown', handleMousedown, true);
  targetElement.addEventListener('contextmenu', handleContextmenu, true);
}

/**
 * Remove the event listeners and resets the controller
 **/
function disable () {
  targetElement.removeEventListener('pointerdown', handleMousedown, true);
  targetElement.removeEventListener('contextmenu', handleContextmenu, true);

  // reset to initial state
  reset();
}


/**
 * Cancel the gesture controller and reset its state
 **/
function cancel () {
  // reset to initial state
  reset();
}

// private variables and methods


// internal states are PASSIVE, PENDING, ACTIVE, ABORTED
let state = PASSIVE;

// keep preventDefault true for the special case that the contextmenu is fired without a privious mousedown
let preventDefault = true;

// contains the timeout identifier
let timeoutId = null;

// holds all custom module event callbacks
const events = {
  'start': new Set(),
  'update': new Set(),
  'abort': new Set(),
  'end': new Set()
};

// temporary buffer for occurred mouse events where the latest event is always at the end of the array
let mouseEventBuffer = [];

let targetElement = window,
    mouseButton = RIGHT_MOUSE_BUTTON,
    suppressionKey = "",
    distanceThreshold = 10,
    timeoutActive = false,
    timeoutDuration = 1000;

/**
 * Initializes the gesture controller to the "pending" state, where it's unclear if the user is starting a gesture or not
 * requires a mouse/pointer event
 **/
function initialize (event) {
  // buffer initial mouse event
  mouseEventBuffer.push(event);

  // change internal state
  state = PENDING;

  preventDefault = false;

  // add gesture detection listeners
  targetElement.addEventListener('pointermove', handleMousemove, true);
  targetElement.addEventListener('dragstart', handleDragstart, true);
  targetElement.addEventListener('keydown', handleKeydown, true);
  targetElement.addEventListener('pointerup', handleMouseup, true);

  // workaround to redirect all events to this frame
  document.documentElement.setPointerCapture(event.pointerId);
}


/**
 * Indicates the gesture start and update and should be called every time the cursor position changes
 * start - will be called once after the distance threshold has been exceeded
 * update - will be called afterwards for every pointer move
 * requires a mouse/pointer event
 **/
function update (event) {
  // buffer mouse event
  mouseEventBuffer.push(event);

  // needs to be called to prevent the values of the coalesced events from getting cleared (probably a Firefox bug)
  event.getCoalescedEvents();

  // initiate gesture
  if (state === PENDING) {
    // get the initital and latest event
    const initialEvent = mouseEventBuffer[0];
    const latestEvent = mouseEventBuffer[mouseEventBuffer.length - 1];
    // check if the distance between the initital pointer and the latest pointer is greater than the threshold
    if (getDistance(initialEvent.clientX, initialEvent.clientY, latestEvent.clientX, latestEvent.clientY) > distanceThreshold) {
      // dispatch all binded functions on start and pass the initial event and an array of the buffered mouse events
      events['start'].forEach(callback => callback(initialEvent, mouseEventBuffer));
  
      // change internal state
      state = ACTIVE;

      preventDefault = true;
    }
  }

  // update gesture
  else if (state === ACTIVE) {
    // dispatch all binded functions on update and pass the latest event and an array of the buffered mouse events
    events['update'].forEach(callback => callback(event, mouseEventBuffer));

    // handle timeout
    if (timeoutActive) {
      // clear previous timeout if existing
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(abort, timeoutDuration);
    }
  }
}


/**
 * Indicates the gesture abortion and sets the state to aborted
 **/
function abort () {
  // dispatch all binded functions on timeout and pass an array of buffered mouse events
  events['abort'].forEach(callback => callback(mouseEventBuffer));
  state = ABORTED;
}


/**
 * Indicates the gesture end and should be called to terminate the gesture
 * requires a mouse/pointer event
 **/
function terminate (event) {
  // buffer mouse event
  mouseEventBuffer.push(event);

  if (state === ACTIVE) {
    // dispatch all binded functions on end and pass the latest event and an array of the buffered mouse events
    events['end'].forEach(callback => callback(event, mouseEventBuffer));
  }

  // release event redirect
  document.documentElement.releasePointerCapture(event.pointerId);

  // reset gesture controller
  reset();
}


/**
 * Resets the controller to its initial state
 **/
function reset () {
  // remove gesture detection listeners
  targetElement.removeEventListener('pointermove', handleMousemove, true);
  targetElement.removeEventListener('pointerup', handleMouseup, true);
  targetElement.removeEventListener('keydown', handleKeydown, true);
  targetElement.removeEventListener('dragstart', handleDragstart, true);

  // reset mouse event buffer and internal state
  mouseEventBuffer = [];
  state = PASSIVE;

  if (timeoutId) {
    window.clearTimeout(timeoutId);
    timeoutId = null;
  }
}


/**
 * Handles mousedown which will initialize the gesture and switch to the pedning state
 **/
function handleMousedown (event) {
  // on mouse button and no supression key
  if (event.isTrusted && event.buttons === mouseButton && (!suppressionKey || !event[suppressionKey])) {
    initialize(event);

    // prevent middle click scroll
    if (mouseButton === MIDDLE_MOUSE_BUTTON) event.preventDefault();
  }
}


/**
 * Handles mousemove which will either start the gesture or update it
 **/
function handleMousemove (event) {
  if (event.isTrusted && event.buttons === mouseButton) {
    update(event);

    // prevent text selection
    if (mouseButton === LEFT_MOUSE_BUTTON) window.getSelection().removeAllRanges();
  }
}


/**
 * Handles mouseup and terminates the gesture
 **/
function handleMouseup (event) {
  if (event.isTrusted && event.button === toSingleButton(mouseButton)) {
    terminate(event);
  }
}


/**
 * Handles context menu popup and prevents it if needed
 **/
 function handleContextmenu (event) {
  if (event.isTrusted && preventDefault && event.button === toSingleButton(mouseButton) && mouseButton === RIGHT_MOUSE_BUTTON) {
    // prevent contextmenu and event propagation
    event.stopPropagation();
    event.preventDefault();
  }

  preventDefault = true;
}


/**
 * Handles keydown and aborts the controller if the suppression key is pressed
 **/
function handleKeydown (event) {
  // do not use the event.shiftKey, altKey and ctrlKey properties since they are unreliable on windows
  // instead map the suppression key names to the event key names
  const pressedKey = {
    "Shift" : "shiftKey",
    "Control": "ctrlKey",
    "Alt": "altKey"
  }[event.key];

  // if suppression key is defined and pressed
  // filter repeatedly fired events if the key is held down
  if (event.isTrusted && !event.repeat && suppressionKey && pressedKey === suppressionKey) {
    abort();
    event.preventDefault();
  }
}


/**
 * Handles dragstart and prevents it if needed
 **/
function handleDragstart (event) {
  // prevent drag if mouse button and no supression key is pressed
  if (event.isTrusted && event.buttons === mouseButton && (!suppressionKey || !event[suppressionKey])) {
    event.preventDefault();
  }
}

// global static variables

const LEFT_MOUSE_BUTTON$1 = 1;
const RIGHT_MOUSE_BUTTON$1 = 2;

/**
 * RockerGestureController "singleton"
 * provides 2 events: on rockerleft and rockerright
 * events can be added via addEventListener and removed via removeEventListener
 * on default the controller is disabled and must be enabled via enable()
 **/


// public methods and variables


var RockerGestureController = {
  enable: enable$1,
  disable: disable$1,
  addEventListener: addEventListener$1,
  hasEventListener: hasEventListener$1,
  removeEventListener: removeEventListener$1,

  get targetElement () {
    return targetElement$1;
  },
  set targetElement (value) {
    targetElement$1 = value;
  }
};


/**
 * Add callbacks to the given events
 **/
function addEventListener$1 (event, callback) {
  // if event exists add listener (duplicates won't be added)
  if (event in events$1) events$1[event].add(callback);
}

/**
 * Check if an event listener is registered
 **/
function hasEventListener$1 (event, callback) {
  // if event exists check for listener
  if (event in events$1) events$1[event].has(callback);
}

/**
 * Remove callbacks from the given events
 **/
function removeEventListener$1 (event, callback) {
  // if event exists remove listener
  if (event in events$1) events$1[event].delete(callback);
}

/**
 * Add the event listeners to detect a gesture start
 **/
function enable$1 () {
  targetElement$1.addEventListener('mousedown', handleMousedown$1, true);
  targetElement$1.addEventListener('mouseup', handleMouseup$1, true);
  targetElement$1.addEventListener('click', handleClick, true);
  targetElement$1.addEventListener('contextmenu', handleContextmenu$1, true);
  targetElement$1.addEventListener('visibilitychange', handleVisibilitychange, true);
}

/**
 * Remove the event listeners and resets the controller
 **/
function disable$1 () {
  preventDefault$1 = true;
  targetElement$1.removeEventListener('mousedown', handleMousedown$1, true);
  targetElement$1.removeEventListener('mouseup', handleMouseup$1, true);
  targetElement$1.removeEventListener('click', handleClick, true);
  targetElement$1.removeEventListener('contextmenu', handleContextmenu$1, true);
  targetElement$1.removeEventListener('visibilitychange', handleVisibilitychange, true);
}

// private variables and methods

// holds all custom module event callbacks
const events$1 = {
  'rockerleft': new Set(),
  'rockerright': new Set()
};

let targetElement$1 = window;

// defines whether or not the click/contextmenu should be prevented
// keep preventDefault true for the special case that the contextmenu or click is fired without a privious mousedown
let preventDefault$1 = true;

// timestamp of the last mouseup
// this is needed to distinguish between true mouse click events and other click events fired by pressing enter or by clicking labels
let lastMouseup = 0;


/**
 * Handles mousedown which will detect the target and handle prevention
 **/
function handleMousedown$1 (event) {
  if (event.isTrusted) {
    // always disable prevention on mousedown
    preventDefault$1 = false;

    if (event.buttons === LEFT_MOUSE_BUTTON$1 + RIGHT_MOUSE_BUTTON$1 && (event.button === toSingleButton(LEFT_MOUSE_BUTTON$1) || event.button === toSingleButton(RIGHT_MOUSE_BUTTON$1))) {
      // dispatch all binded functions on rocker and pass the appropriate event
      if (event.button === toSingleButton(LEFT_MOUSE_BUTTON$1)) events$1['rockerleft'].forEach((callback) => callback(event));
      else if (event.button === toSingleButton(RIGHT_MOUSE_BUTTON$1)) events$1['rockerright'].forEach((callback) => callback(event));

      event.stopPropagation();
      event.preventDefault();
      // enable prevention
      preventDefault$1 = true;
    }
  }
}


/**
 * This is only needed to distinguish between true mouse click events and other click events fired by pressing enter or by clicking labels
 * Other property values like screen position or target could be used in the same manner
 **/
function handleMouseup$1(event) {
  lastMouseup = event.timeStamp;
}


/**
 * This is only needed for tab changing actions
 * Because the rocker gesture is executed in a different tab as where click/contextmenu needs to be prevented
 **/
function handleVisibilitychange() {
  // keep preventDefault true for the special case that the contextmenu or click is fired without a privious mousedown
  preventDefault$1 = true;
}


/**
 * Handles and prevents context menu if needed (right click)
 **/
function handleContextmenu$1 (event) {
  if (event.isTrusted && preventDefault$1 && event.button === toSingleButton(RIGHT_MOUSE_BUTTON$1)) {
    // prevent contextmenu
    event.stopPropagation();
    event.preventDefault();
  }
}


/**
 * Handles and prevents click event if needed (left click)
 **/
function handleClick (event) {
  // event.detail because a click event can be fired without clicking (https://stackoverflow.com/questions/4763638/enter-triggers-button-click)
  // timeStamp check ensures that the click is fired by mouseup
  if (event.isTrusted && preventDefault$1 && event.button === toSingleButton(LEFT_MOUSE_BUTTON$1) && event.detail && event.timeStamp === lastMouseup) {
    // prevent click
    event.stopPropagation();
    event.preventDefault();
  }
}

// global static variables

const LEFT_MOUSE_BUTTON$2 = 1;
const RIGHT_MOUSE_BUTTON$2 = 2;
const MIDDLE_MOUSE_BUTTON$1 = 4;

/**
 * WheelGestureController "singleton"
 * provides 2 events: on wheelup and wheeldown
 * events can be added via addEventListener and removed via removeEventListener
 * on default the controller is disabled and must be enabled via enable()
 **/


// public methods and variables


var WheelGestureController = {
  enable: enable$2,
  disable: disable$2,
  addEventListener: addEventListener$2,
  hasEventListener: hasEventListener$2,
  removeEventListener: removeEventListener$2,

  get targetElement () {
    return targetElement$2;
  },
  set targetElement (value) {
    targetElement$2 = value;
  },

  get mouseButton () {
    return mouseButton$1;
  },
  set mouseButton (value) {
    mouseButton$1 = Number(value);
  },

  get wheelSensitivity () {
    return wheelSensitivity;
  },
  set wheelSensitivity (value) {
    wheelSensitivity = Number(value);
  }
};


/**
 * Add callbacks to the given events
 **/
function addEventListener$2 (event, callback) {
  // if event exists add listener (duplicates won't be added)
  if (event in events$2) events$2[event].add(callback);
}

/**
 * Check if an event listener is registered
 **/
function hasEventListener$2 (event, callback) {
  // if event exists check for listener
  if (event in events$2) events$2[event].has(callback);
}

/**
 * Remove callbacks from the given events
 **/
function removeEventListener$2 (event, callback) {
  // if event exists remove listener
  if (event in events$2) events$2[event].delete(callback);
}

/**
 * Add the document event listener
 **/
function enable$2 () {
  targetElement$2.addEventListener('wheel', handleWheel, {capture: true, passive: false});
  targetElement$2.addEventListener('mousedown', handleMousedown$2, true);
  targetElement$2.addEventListener('mouseup', handleMouseup$2, true);
  targetElement$2.addEventListener('click', handleClick$1, true);
  targetElement$2.addEventListener('contextmenu', handleContextmenu$2, true);
  targetElement$2.addEventListener('visibilitychange', handleVisibilitychange$1, true);
}

/**
 * Remove the event listeners and resets the handler
 **/
function disable$2 () {
  preventDefault$2 = true;
  targetElement$2.removeEventListener('wheel', handleWheel, {capture: true, passive: false});
  targetElement$2.removeEventListener('mousedown', handleMousedown$2, true);
  targetElement$2.removeEventListener('mouseup', handleMouseup$2, true);
  targetElement$2.removeEventListener('click', handleClick$1, true);
  targetElement$2.removeEventListener('contextmenu', handleContextmenu$2, true);
  targetElement$2.removeEventListener('visibilitychange', handleVisibilitychange$1, true);
}

// private variables and methods

// holds all custom module event callbacks
const events$2 = {
  'wheelup': new Set(),
  'wheeldown': new Set()
};

let targetElement$2 = window,
    mouseButton$1 = LEFT_MOUSE_BUTTON$2,
    wheelSensitivity = 2;

// keep preventDefault true for the special case that the contextmenu or click is fired without a privious mousedown
let preventDefault$2 = true;

let lastMouseup$1 = 0;

let accumulatedDeltaY = 0;


/**
 * Handles mousedown which will detect the target and handle prevention
 **/
function handleMousedown$2 (event) {
  if (event.isTrusted) {
    // always disable prevention on mousedown
    preventDefault$2 = false;

    // always reset the accumulated detlaY
    accumulatedDeltaY = 0;

    // prevent middle click scroll
    if (mouseButton$1 === MIDDLE_MOUSE_BUTTON$1 && event.buttons === MIDDLE_MOUSE_BUTTON$1) event.preventDefault();
  }
}


/**
 * Handles mousewheel up and down and prevents scrolling if needed
 **/
function handleWheel (event) {
  if (event.isTrusted && event.buttons === mouseButton$1 && event.deltaY !== 0) {

    // check if the sign is different and reset the accumulated value
    if ((accumulatedDeltaY < 0) !== (event.deltaY < 0)) accumulatedDeltaY = 0;

    accumulatedDeltaY += event.deltaY;

    if (Math.abs(accumulatedDeltaY) >= wheelSensitivity) {
      // dispatch all binded functions on wheel up/down and pass the appropriate event
      if (accumulatedDeltaY < 0) {
        events$2['wheelup'].forEach((callback) => callback(event));
      }
      else if (accumulatedDeltaY > 0) {
        events$2['wheeldown'].forEach((callback) => callback(event));
      }

      // reset accumulated deltaY if it reaches the sensitivity value
      accumulatedDeltaY = 0;
    }

    event.stopPropagation();
    event.preventDefault();
    // enable prevention
    preventDefault$2 = true;
  }
}


/**
 * This is only needed to distinguish between true mouse click events and other click events fired by pressing enter or by clicking labels
 * Other property values like screen position or target could be used in the same manner
 **/
function handleMouseup$2(event) {
  lastMouseup$1 = event.timeStamp;
}


/**
 * This is only needed for tab changing actions
 * Because the wheel gesture is executed in a different tab as where click/contextmenu needs to be prevented
 **/
function handleVisibilitychange$1() {
  // keep preventDefault true for the special case that the contextmenu or click is fired without a privious mousedown
  preventDefault$2 = true;
  // always reset the accumulated detlaY
  accumulatedDeltaY = 0;
}


/**
 * Handles and prevents context menu if needed
 **/
function handleContextmenu$2 (event) {
  if (event.isTrusted && preventDefault$2 && event.button === toSingleButton(mouseButton$1) && mouseButton$1 === RIGHT_MOUSE_BUTTON$2) {
    // prevent contextmenu
    event.stopPropagation();
    event.preventDefault();
  }
}


/**
 * Handles and prevents click event if needed
 **/
function handleClick$1 (event) {
  // event.detail because a click event can be fired without clicking (https://stackoverflow.com/questions/4763638/enter-triggers-button-click)
  // timeStamp check ensures that the click is fired by mouseup
  if (event.isTrusted && preventDefault$2 && event.button === toSingleButton(mouseButton$1) && (mouseButton$1 === LEFT_MOUSE_BUTTON$2 || mouseButton$1 === MIDDLE_MOUSE_BUTTON$1) && event.detail && event.timeStamp === lastMouseup$1) {
    // prevent left and middle click
    event.stopPropagation();
    event.preventDefault();
  }
}

/**
 * Helper class to create a pattern alongside mouse movement from points
 * A Pattern is a combination/array of 2D Vectors while each Vector is an array
 **/
class PatternConstructor {
  constructor (differenceThreshold = 0, distanceThreshold = 0) {
    this.differenceThreshold = differenceThreshold;
    this.distanceThreshold = distanceThreshold;

    this._lastExtractedPointX = null;
    this._lastExtractedPointY = null;
    this._previousPointX = null;
    this._previousPointY = null;
    this._lastPointX = null;
    this._lastPointY = null;
    this._previousVectoX = null;
    this._previousVectoY = null;

    this._extracedVectors = [];
  }

  /**
   * Resets the internal class variables and clears the constructed pattern
   **/
  clear () {
    // clear extracted vectors
    this._extracedVectors.length = 0;
    // reset variables
    this._lastExtractedPointX = null;
    this._lastExtractedPointY = null;
    this._previousPointX = null;
    this._previousPointY = null;
    this._lastPointX = null;
    this._lastPointY = null;
    this._previousVectoX = null;
    this._previousVectoY = null;
  }


  /**
   * Add a point to the constrcutor
   * Returns an integer value:
   * 1 if the added point passed the distance threshold
   * 2 if the added point also passed the difference threshold
   * else 0
   **/
  addPoint (x, y) {
    // return variable
    let changeIndicator = 0;
    // on first point / if no previous point exists
    if (this._previousPointX === null || this._previousPointY === null) {
      // set first extracted point
      this._lastExtractedPointX = x;
      this._lastExtractedPointY = y;
      // set previous point to first point
      this._previousPointX = x;
      this._previousPointY = y;
    }

    else {
      const newVX = x - this._previousPointX;
      const newVY = y - this._previousPointY;
  
      const vectorDistance = Math.hypot(newVX, newVY);
      if (vectorDistance > this.distanceThreshold) {
        // on second point / if no previous vector exists
        if (this._previousVectoX === null || this._previousVectoY === null) {
          // store previous vector
          this._previousVectoX = newVX;
          this._previousVectoY = newVY;
        }
        else {
          // calculate vector difference
          const vectorDifference = vectorDirectionDifference(this._previousVectoX, this._previousVectoY, newVX, newVY);
          if (Math.abs(vectorDifference) > this.differenceThreshold) {
            // store new extracted vector
            this._extracedVectors.push([
              this._previousPointX - this._lastExtractedPointX,
              this._previousPointY - this._lastExtractedPointY
            ]);
            // update previous vector
            this._previousVectoX = newVX;
            this._previousVectoY = newVY;
            // update last extracted point
            this._lastExtractedPointX = this._previousPointX;
            this._lastExtractedPointY = this._previousPointY;
            // update change variable
            changeIndicator++;
          }
        }
        // update previous point
        this._previousPointX = x;
        this._previousPointY = y;
        // update change variable
        changeIndicator++;
      }
    }
    // always store the last point
    this._lastPointX = x;
    this._lastPointY = y;

    return changeIndicator;
  }


  /**
   * Returns the current constructed pattern
   * Adds the last added point as the current end point
   **/
  getPattern () {
    // check if variables contain point values
    if (this._lastPointX === null || this._lastPointY === null || this._lastExtractedPointX === null || this._lastExtractedPointY === null) {
      return [];
    }
    // calculate vector from last extracted point to ending point
    const lastVector = [
      this._lastPointX - this._lastExtractedPointX,
      this._lastPointY - this._lastExtractedPointY
    ];
    return [...this._extracedVectors, lastVector];
  }
}


/**
 * Returns the dierection difference of 2 vectors
 * Range: (-1, 0, 1]
 * 0 = same direction
 * 1 = opposite direction
 * + and - indicate if the direction difference is counter clockwise (+) or clockwise (-)
 **/
function vectorDirectionDifference (V1X, V1Y, V2X, V2Y) {
  // calculate the difference of the vectors angle
  let angleDifference = Math.atan2(V1X, V1Y) - Math.atan2(V2X, V2Y);
  // normalize intervall to [PI, -PI)
  if (angleDifference > Math.PI) angleDifference -= 2 * Math.PI;
  else if (angleDifference <= -Math.PI) angleDifference += 2 * Math.PI;
  // shift range from [PI, -PI) to [1, -1)
  return angleDifference / Math.PI;
}

/**
 * MouseGestureView "singleton"
 * provides multiple functions to manipulate the overlay
 **/


// public methods and variables


var MouseGestureView = {
  initialize: initialize$1,
  updateGestureTrace: updateGestureTrace,
  updateGestureCommand: updateGestureCommand,
  terminate: terminate$1,
  
  // gesture Trace styles

  get gestureTraceLineColor () {
    const rgbHex = Context.fillStyle;
    const alpha = parseFloat(Canvas.style.getPropertyValue("opacity")) || 1;
    let aHex = Math.round(alpha * 255).toString(16);
    // add leading zero if string length is 1
    if (aHex.length === 1) aHex = "0" + aHex;
    return rgbHex + aHex;
  },
  set gestureTraceLineColor (value) {
    const rgbHex = value.substring(0, 7);
    const aHex = value.slice(7);
    const alpha = parseInt(aHex, 16)/255;
    Context.fillStyle = rgbHex;
    Canvas.style.setProperty("opacity", alpha, "important");
  },

  get gestureTraceLineWidth () {
    return gestureTraceLineWidth;
  },
  set gestureTraceLineWidth (value) {
    gestureTraceLineWidth = value;
  },

  get gestureTraceLineGrowth () {
    return gestureTraceLineGrowth;
  },
  set gestureTraceLineGrowth (value) {
    gestureTraceLineGrowth = Boolean(value);
  },

  // gesture command styles

  get gestureCommandFontSize () {
    return Command.style.getPropertyValue('font-size');
  },
  set gestureCommandFontSize (value) {
    Command.style.setProperty('font-size', value, 'important');
  },

  get gestureCommandFontColor () {
    return Command.style.getPropertyValue('color');
  },
  set gestureCommandFontColor (value) {
    Command.style.setProperty('color', value, 'important');
  },

  get gestureCommandBackgroundColor () {
    return Command.style.getPropertyValue('background-color');
  },
  set gestureCommandBackgroundColor (value) {
    Command.style.setProperty('background-color', value);
  },

  get gestureCommandHorizontalPosition () {
    return parseFloat(Command.style.getPropertyValue("--horizontalPosition"));
  },
  set gestureCommandHorizontalPosition (value) {
    Command.style.setProperty("--horizontalPosition", value);
  },

  get gestureCommandVerticalPosition () {
    return parseFloat(Command.style.getPropertyValue("--verticalPosition"));
  },
  set gestureCommandVerticalPosition (value) {
    Command.style.setProperty("--verticalPosition", value);
  }
};


/**
 * appand overlay and start drawing the gesture
 **/
function initialize$1 (x, y) {
  // overlay is not working in a pure svg page thus do not append the overlay
  if (document.documentElement.tagName.toUpperCase() === "SVG") return;

  if (document.body.tagName.toUpperCase() === "FRAMESET") {
    document.documentElement.appendChild(Overlay);
  }
  else {
    document.body.appendChild(Overlay);
  }
  // store starting point
  lastPoint.x = x;
  lastPoint.y = y;
}


/**
 * draw line for gesture
 */
function updateGestureTrace (points) {
  if (!Overlay.contains(Canvas)) Overlay.appendChild(Canvas);

  // temporary path in order draw all segments in one call
  const path = new Path2D();
  
  for (let point of points) {
    if (gestureTraceLineGrowth && lastTraceWidth < gestureTraceLineWidth) {
      // the length in pixels after which the line should be grown to its final width
      // in this case the length depends on the final width defined by the user
      const growthDistance = gestureTraceLineWidth * 50;
      // the distance from the last point to the current
      const distance = getDistance(lastPoint.x, lastPoint.y, point.x, point.y);
      // cap the line width by its final width value
      const currentTraceWidth = Math.min(
        lastTraceWidth + distance / growthDistance * gestureTraceLineWidth,
        gestureTraceLineWidth
      );
      const pathSegment = createGrowingLine(lastPoint.x, lastPoint.y, point.x, point.y, lastTraceWidth, currentTraceWidth);
      path.addPath(pathSegment);

      lastTraceWidth = currentTraceWidth;
    }
    else {
      const pathSegment = createGrowingLine(lastPoint.x, lastPoint.y, point.x, point.y, gestureTraceLineWidth, gestureTraceLineWidth);
      path.addPath(pathSegment);
    }
    
    lastPoint.x = point.x;
    lastPoint.y = point.y;
  }
  // draw accumulated path segments
  Context.fill(path);
}


/**
 * update command on match
 **/
function updateGestureCommand (command) {
  if (command) {
    if (!Overlay.contains(Command)) Overlay.appendChild(Command);
    Command.textContent = command;
  }
  else Command.remove();
}


/**
 * remove and reset overlay
 **/
function terminate$1 () {
  Overlay.remove();
  Canvas.remove();
  Command.remove();
  // clear canvas
  Context.clearRect(0, 0, Canvas.width, Canvas.height);
  // reset trace line width
  lastTraceWidth = 0;
  Command.textContent = "";
}


// private variables and methods


// also used to caputre the mouse events over iframes
const Overlay = document.createElement("div");
      Overlay.style = `
        all: initial !important;
        position: fixed !important;
        top: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 2147483647 !important;

        pointer-events: none !important;
      `;

const Canvas = document.createElement("canvas");
      Canvas.style = `
        all: initial !important;
        
        pointer-events: none !important;
      `;

const Context = Canvas.getContext('2d');

const Command = document.createElement("div");
      Command.style = `
        --horizontalPosition: 0;
        --verticalPosition: 0;
        all: initial !important;
        position: absolute !important;
        top: calc(var(--verticalPosition) * 1%) !important;
        left: calc(var(--horizontalPosition) * 1%) !important;
        transform: translate(calc(var(--horizontalPosition) * -1%), calc(var(--verticalPosition) * -1%)) !important;
        font-family: "NunitoSans Regular", "Arial", sans-serif !important;
        line-height: normal !important;
        text-shadow: 0.01em 0.01em 0.01em rgba(0,0,0, 0.5) !important;
        text-align: center !important;
        padding: 0.4em 0.4em 0.3em !important;
        font-weight: bold !important;
        background-color: rgba(0,0,0,0) !important;
        width: max-content !important;
        max-width: 50vw !important;
        
        pointer-events: none !important;
      `;


let gestureTraceLineWidth = 10,
    gestureTraceLineGrowth = true;


let lastTraceWidth = 0,
    lastPoint = { x: 0, y: 0 };


// resize canvas on window resize
window.addEventListener('resize', maximizeCanvas, true);
maximizeCanvas();


/**
 * Adjust the canvas size to the size of the window
 **/
function maximizeCanvas () {
  // save context properties, because they get cleared on canvas resize
  const tmpContext = {
    lineCap: Context.lineCap,
    lineJoin: Context.lineJoin,
    fillStyle: Context.fillStyle,
    strokeStyle: Context.strokeStyle,
    lineWidth: Context.lineWidth
  }; 

  Canvas.width = window.innerWidth;
  Canvas.height = window.innerHeight;

  // restore previous context properties
  Object.assign(Context, tmpContext);
}


/**
 * creates a growing line from a starting point and strike width to an end point and stroke width
 * returns a path 2d object
 **/
function createGrowingLine (x1, y1, x2, y2, startWidth, endWidth) {
  // calculate direction vector of point 1 and 2
  const directionVectorX = x2 - x1,
        directionVectorY = y2 - y1;
  // calculate angle of perpendicular vector
  const perpendicularVectorAngle = Math.atan2(directionVectorY, directionVectorX) + Math.PI/2;
  // construct shape
  const path = new Path2D();
        path.arc(x1, y1, startWidth/2, perpendicularVectorAngle, perpendicularVectorAngle + Math.PI);
        path.arc(x2, y2, endWidth/2, perpendicularVectorAngle + Math.PI, perpendicularVectorAngle);
        path.closePath();
  return path;
}

/**
 * PopupCommandView
 * listens for "PopupRequest" background messages and displays an popup according to the message data
 * an iframe is used in order to protect the user data from webpages that may try to read or manipulate the contents of the popup
 **/


// private variables and methods

const Popup = document.createElement("iframe");
      Popup.style = `
          all: initial !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          border: 0 !important;
          z-index: 2147483647 !important;
          box-shadow: 1px 1px 5px rgba(0,0,0,0.4) !important;
          opacity: 0 !important;
          transition: opacity .3s !important;
        `;
      Popup.onload = initialize$2;
      Popup.src = browser.extension.getURL("/core/views/popup-command-view/popup-command-view.html");

// expose the send response message function to the global scope
let sendResponse = null;

// contains the message data
let data = null;

// contains the mouse position retrieved from the message
const position = {
  x: 0,
  y: 0
};

// setup background/command message event listener
browser.runtime.onMessage.addListener(handleMessage);


/**
 * Called on popup load
 * Exports all necessary functions
 * Builds all html contents, sizes and positions the popup
 **/
function initialize$2 () {
  // unwrap iframe window
  const popupWindow = Popup.contentWindow.wrappedJSObject;

  // export necessary event handler functions
  popupWindow.handleWheel = exportFunction(handleWheel$1, popupWindow);
  popupWindow.handleContextmenu = exportFunction(handleContextmenu$3, popupWindow);
  popupWindow.handleItemSelection = exportFunction(handleItemSelection, popupWindow);
  popupWindow.handleKeyDown = exportFunction(handleKeyDown, popupWindow);
  popupWindow.handleBlur = exportFunction(handleBlur, popupWindow);
  popupWindow.handleScrollButtonMouseover = exportFunction(handleScrollButtonMouseover, popupWindow);

  // add event listeners
  popupWindow.addEventListener("wheel", popupWindow.handleWheel, true);
  popupWindow.addEventListener("contextmenu", popupWindow.handleContextmenu, true);
  popupWindow.addEventListener("keydown", popupWindow.handleKeyDown, true);

  // create list
  const list = Popup.contentDocument.createElement("ul");
        list.id = "list";
  // map data to list items
  for (let element of data) {
    const item = Popup.contentDocument.createElement("li");
          item.classList.add("item");
          item.onclick = handleItemSelection;
          item.dataset.id = element.id;
    // add image icon if available
    if (element.icon) {
      const image = Popup.contentDocument.createElement("img");
            image.src = element.icon;
      item.appendChild(image);
    }
    // add label
    const text = Popup.contentDocument.createElement("span");
          text.textContent = element.label;
    item.appendChild(text);

    list.appendChild(item);
  }
  // append list
  Popup.contentDocument.body.appendChild(list);
  // focus Popup (some tweaks to ensure the focus)
  Popup.contentDocument.body.tabIndex = -1;
  document.activeElement.blur();
  Popup.contentDocument.body.focus();
  Popup.contentDocument.body.onblur = handleBlur;

  // try to get the relative screen width without scrollbar
  const relativeScreenWidth = document.documentElement.clientWidth || document.body.clientWidth || window.innerWidth;
  const relativeScreenHeight = document.documentElement.clientHeight || document.body.clientHeight || window.innerHeight;

  // get the absolute maximum available height from the current position either from the top or bottom
  const maxAvailableHeight = Math.max(relativeScreenHeight - position.y, position.y);

  // get absolute list dimensions
  const width = list.scrollWidth;
  const height = Math.min(list.scrollHeight, maxAvailableHeight);

  // convert absolute to relative dimensions
  const relativeWidth = width;
  const relativeHeight = height;

  // calculate absolute available space to the right and bottom
  const availableSpaceRight = (relativeScreenWidth - position.x);
  const availableSpaceBottom = (relativeScreenHeight - position.y);

  // get the ideal relative position based on the given available space and dimensions
  const x = availableSpaceRight >= width ? position.x : position.x - relativeWidth;
  const y = availableSpaceBottom >= height ? position.y : position.y - relativeHeight;

  // add scroll buttons if list is scrollable
  if (height < list.scrollHeight) {
    const buttonUp = Popup.contentDocument.createElement("div");
          buttonUp.classList.add("button", "up");
          buttonUp.onmouseover = handleScrollButtonMouseover;
    const buttonDown = Popup.contentDocument.createElement("div");
          buttonDown.classList.add("button", "down");
          buttonDown.onmouseover = handleScrollButtonMouseover;
    Popup.contentDocument.body.append(buttonUp, buttonDown);
  }

  // apply scale, position, dimensions to Popup / iframe and make it visible
  Popup.style.setProperty('width', Math.round(width) + 'px', 'important');
  Popup.style.setProperty('height', Math.round(height) + 'px', 'important');
  Popup.style.setProperty('transform-origin', `0 0`, 'important');
  Popup.style.setProperty('transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`, 'important');
  Popup.style.setProperty('opacity', '1', 'important');
}


/**
 * Terminates the popup and resolves the messaging channel promise
 * Also used to pass the selected item to the corresponding command
 **/
function terminate$2 (message = null) {
  sendResponse(message);
  Popup.remove();
  Popup.style.setProperty('opacity', '0', 'important');
}


/**
 * Handles background messages which request to create a popup
 * This also exposes necessary data and the message response function
 **/
function handleMessage (message) {
  if (message.subject === "PopupRequest") {
    // store reference for other functions
    position.x = message.data.mousePosition.x - window.mozInnerScreenX;
    position.y = message.data.mousePosition.y - window.mozInnerScreenY;
    data = message.data.dataset;

    // popup is not working in a pure svg page thus do not append the popup
    if (document.documentElement.tagName.toUpperCase() === "SVG") return;
    
    // this will start loading the iframe content
    if (document.body.tagName.toUpperCase() === "FRAMESET")
      document.documentElement.appendChild(Popup);
    else document.body.appendChild(Popup);

    return new Promise(resolve => sendResponse = resolve);
  }
}


/**
 * Handles and emulates mouse wheel scrolling inside the popup
 **/
function handleWheel$1 (event) {
  Popup.contentWindow.scrollBy(0, event.deltaY * 10);
  event.preventDefault();
  event.stopPropagation();
}


/**
 * Prevents the context menu because of design reason and for rocker gesture conflicts
 **/
function handleContextmenu$3 (event) {
  event.preventDefault();
}


/**
 * Passes the id of the selected item to the termination function
 **/
function handleItemSelection () {
  terminate$2(this.dataset.id);
}


/**
 * Handles up and down arrow keys
 **/
function handleKeyDown (event) {
  if (event.key === "ArrowUp")
    Popup.contentWindow.scrollBy(0, -28);
  else if (event.key === "ArrowDown")
    Popup.contentWindow.scrollBy(0, 28);
}


/**
 * Handles the up and down controls
 **/
function handleScrollButtonMouseover (event) {
  const direction = this.classList.contains("up") ? -4 : 4;
  const button = event.currentTarget;

  function step (timestamp) {
    if (!button.matches(':hover')) return;
    Popup.contentWindow.scrollBy(0, direction);
    window.requestAnimationFrame(step);
  }
  window.requestAnimationFrame(step);
}


/**
 * Handles the blur event and terminates the popup if not already done
 **/
function handleBlur () {
  if (document.documentElement.contains(Popup) || document.body.contains(Popup)) {
    terminate$2();
  }
}

/**
 * User Script Controller
 * helper to safely execute custom user scripts in the page context
 * will hopefully one day be replaced with https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts
 **/

// add the message event listener
browser.runtime.onMessage.addListener(handleMessage$1);

/**
 * Handles user script execution messages from the user script command
 **/
function handleMessage$1 (message, sender, sendResponse) {
  if (message.subject === "executeUserScript") {
    // create function in page script scope (not content script scope)
    // so it is not executed as privileged extension code and thus has no access to webextension apis
    // this also prevents interference with the extension code
    const executeUserScript = new window.wrappedJSObject.Function("TARGET", message.data);
    executeUserScript(window.TARGET);
  }
}

// global variable containing the hierarchy of target html elements for scripts injected by commands
window.TARGET = null;

// expose commons functions to scripts injected by commands like scrollTo
window.isEditableInput = isEditableInput;
window.isScrollableY = isScrollableY;
window.scrollToY = scrollToY;
window.getClosestElement = getClosestElement;

const IS_EMBEDED_FRAME = isEmbededFrame();

const Config = new ConfigManager("sync", browser.runtime.getURL("resources/json/defaults.json"));
      Config.autoUpdate = true;
      Config.loaded.then(main);
      Config.addEventListener("change", main);

// setup pattern extractor
const patternConstructor = new PatternConstructor(0.12, 10);

// Define mouse gesture controller event listeners and connect them to the mouse gesture interface methods
// Also sends the appropriate messages to the background script
// movementX/Y cannot be used because the events returned by getCoalescedEvents() contain wrong values (Firefox Bug)

// The conversation to css screen coordinates via window.mozInnerScreenX is required
// to calculate the propper position in the main frame for coordinates from embeded frames 
// (required for popup commands and gesture interface)

MouseGestureController.addEventListener("start", (event, events) => {
  // expose target to global variable
  window.TARGET = event.target;
  // get coalesced events
  const coalescedEvents = [];
  // fallback if getCoalescedEvents is not defined + https://bugzilla.mozilla.org/show_bug.cgi?id=1450692
  for (const event of events) {
    if (event.getCoalescedEvents) coalescedEvents.push(...event.getCoalescedEvents());
  }
  if (!coalescedEvents.length) coalescedEvents.push(...events);

  // build gesture pattern
  for (const event of coalescedEvents) {
    patternConstructor.addPoint(event.clientX, event.clientY);
  }

  // handle mouse gesture interface
  if (Config.get("Settings.Gesture.Trace.display") || Config.get("Settings.Gesture.Command.display")) {
    if (!IS_EMBEDED_FRAME) {
      MouseGestureView.initialize(event.clientX, event.clientY);
    }
    else {
      browser.runtime.sendMessage({
        subject: "mouseGestureViewInitialize",
        data: {
          x: event.clientX + window.mozInnerScreenX,
          y: event.clientY + window.mozInnerScreenY
        }
      });
    }

    // handle mouse gesture interface trace update
    if (Config.get("Settings.Gesture.Trace.display")) {
      if (!IS_EMBEDED_FRAME) {
        const points = coalescedEvents.map(event => ({ x: event.clientX, y: event.clientY }));
        MouseGestureView.updateGestureTrace(points);
      }
      else {
        // map points to screen wide css coordinates
        const points = coalescedEvents.map(event => ({
          x: event.clientX + window.mozInnerScreenX,
          y: event.clientY + window.mozInnerScreenY
        }));
        browser.runtime.sendMessage({
          subject: "mouseGestureViewUpdateGestureTrace",
          data: {
            points: points
          }
        });
      }
    }
  }
});


MouseGestureController.addEventListener("update", (event, events) => {
  // get coalesced events
  // fallback if getCoalescedEvents is not defined + https://bugzilla.mozilla.org/show_bug.cgi?id=1450692
  const coalescedEvents = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
  if (!coalescedEvents.length) coalescedEvents.push(event);

  // build gesture pattern
  for (const event of coalescedEvents) {
    const patternChange = patternConstructor.addPoint(event.clientX, event.clientY);

    if (patternChange && Config.get("Settings.Gesture.Command.display")) {
      // send current pattern to background script
      browser.runtime.sendMessage({
        subject: "gestureChange",
        data: patternConstructor.getPattern()
      });
    }
  }

  // handle mouse gesture interface update
  if (Config.get("Settings.Gesture.Trace.display")) {
    if (!IS_EMBEDED_FRAME) {
      const points = coalescedEvents.map(event => ({ x: event.clientX, y: event.clientY }));
      MouseGestureView.updateGestureTrace(points);
    }
    else {
      // map points to global screen wide coordinates
      const points = coalescedEvents.map(event => ({
        x: event.clientX + window.mozInnerScreenX,
        y: event.clientY + window.mozInnerScreenY
      }));
      browser.runtime.sendMessage({
        subject: "mouseGestureViewUpdateGestureTrace",
        data: {
          points: points
        }
      });
    }
  }
});


MouseGestureController.addEventListener("abort", (events) => {
  // close mouse gesture interface
  if (Config.get("Settings.Gesture.Trace.display") || Config.get("Settings.Gesture.Command.display")) {
    if (!IS_EMBEDED_FRAME) MouseGestureView.terminate();
    else browser.runtime.sendMessage({
      subject: "mouseGestureViewTerminate"
    });
  }
  // clear pattern
  patternConstructor.clear();
});


MouseGestureController.addEventListener("end", (event, events) => {
  // if the target was removed from dom trace a new element at the starting point
  if (!document.body.contains(window.TARGET)) {
    window.TARGET = document.elementFromPoint(events[0].clientX, events[0].clientY);
  }

  // gather traget data and gesture pattern
  const data = getTargetData(window.TARGET);
        data.pattern = patternConstructor.getPattern();
        // transform coordiantes to css screen coordinates
        data.mousePosition = {
          x: event.clientX + window.mozInnerScreenX,
          y: event.clientY + window.mozInnerScreenY
        };
  // send data to background script
  browser.runtime.sendMessage({
    subject: "gestureEnd",
    data: data
  });
  // clear pattern
  patternConstructor.clear();

  // close mouse gesture interface
  if (Config.get("Settings.Gesture.Trace.display") || Config.get("Settings.Gesture.Command.display")) {
    if (!IS_EMBEDED_FRAME) MouseGestureView.terminate();
    else browser.runtime.sendMessage({
      subject: "mouseGestureViewTerminate"
    });
  }
});


// add message listeners to main frame
// these handle the mouse gesture view messages send from embeded frames and the background script

if (!IS_EMBEDED_FRAME) {
  browser.runtime.onMessage.addListener((message) => {
    switch (message.subject) {
      case "mouseGestureViewInitialize":
        // remap points to client wide css coordinates
        MouseGestureView.initialize(
          message.data.x - window.mozInnerScreenX,
          message.data.y - window.mozInnerScreenY
        );
      break;
  
      case "mouseGestureViewUpdateGestureTrace":
        // remap points to client wide css coordinates
        message.data.points.forEach(point => {
          point.x -= window.mozInnerScreenX;
          point.y -= window.mozInnerScreenY;
        });
        MouseGestureView.updateGestureTrace(message.data.points);
      break;
  
      case "mouseGestureViewTerminate":
        MouseGestureView.terminate();
      break;

      case "matchingGesture":
        MouseGestureView.updateGestureCommand(message.data);
      break;
    }
  });
}

// define wheel and rocker gesture controller event listeners
// combine them to one function, since they all do the same except the subject they send to the background script

WheelGestureController.addEventListener("wheelup", event => handleRockerAndWheelEvents("wheelUp", event));
WheelGestureController.addEventListener("wheeldown", event => handleRockerAndWheelEvents("wheelDown", event));
RockerGestureController.addEventListener("rockerleft", event => handleRockerAndWheelEvents("rockerLeft", event));
RockerGestureController.addEventListener("rockerright", event => handleRockerAndWheelEvents("rockerRight", event));

function handleRockerAndWheelEvents (subject, event) {
  // expose target to global variable
  window.TARGET = event.target;

  // cancel mouse gesture and terminate overlay in case it got triggered
  MouseGestureController.cancel();
  // close overlay
  MouseGestureView.terminate();

  // gather specifc data
  const data = getTargetData(window.TARGET);
        data.mousePosition = {
          x: event.clientX + window.mozInnerScreenX,
          y: event.clientY + window.mozInnerScreenY
        };
  // send data to background script
  browser.runtime.sendMessage({
    subject: subject,
    data: data
  });
}


/**
 * Main function
 * Applies the user config to the particular controller or interface
 * Enables or disables the appropriate controller
 **/
function main () {
  // check if current url is not listed in the blacklist
  if (!Config.get("Blacklist").some(matchesCurrentURL)) {

    // apply all settings
    MouseGestureController.mouseButton = Config.get("Settings.Gesture.mouseButton");
    MouseGestureController.suppressionKey = Config.get("Settings.Gesture.suppressionKey");
    MouseGestureController.distanceThreshold = Config.get("Settings.Gesture.distanceThreshold");
    MouseGestureController.timeoutActive = Config.get("Settings.Gesture.Timeout.active");
    MouseGestureController.timeoutDuration = Config.get("Settings.Gesture.Timeout.duration");

    WheelGestureController.mouseButton = Config.get("Settings.Wheel.mouseButton");
    WheelGestureController.wheelSensitivity = Config.get("Settings.Wheel.wheelSensitivity");

    MouseGestureView.gestureTraceLineColor = Config.get("Settings.Gesture.Trace.Style.strokeStyle");
    MouseGestureView.gestureTraceLineWidth = Config.get("Settings.Gesture.Trace.Style.lineWidth");
    MouseGestureView.gestureTraceLineGrowth = Config.get("Settings.Gesture.Trace.Style.lineGrowth");
    MouseGestureView.gestureCommandFontSize = Config.get("Settings.Gesture.Command.Style.fontSize");
    MouseGestureView.gestureCommandFontColor = Config.get("Settings.Gesture.Command.Style.fontColor");
    MouseGestureView.gestureCommandBackgroundColor = Config.get("Settings.Gesture.Command.Style.backgroundColor");
    MouseGestureView.gestureCommandHorizontalPosition = Config.get("Settings.Gesture.Command.Style.horizontalPosition");
    MouseGestureView.gestureCommandVerticalPosition = Config.get("Settings.Gesture.Command.Style.verticalPosition");

    // enable mouse gesture controller
    MouseGestureController.enable();

    // enable/disable rocker gesture
    if (Config.get("Settings.Rocker.active")) {
      RockerGestureController.enable();
    }
    else {
      RockerGestureController.disable();
    }

    // enable/disable wheel gesture
    if (Config.get("Settings.Wheel.active")) {
      WheelGestureController.enable();
    }
    else {
      WheelGestureController.disable();
    }
  }
  // if url is blacklisted disable everything
  else {
    MouseGestureController.disable();
    RockerGestureController.disable();
    WheelGestureController.disable();
  }
}


/**
 * checkes if the given url is a subset of the current url or equal
 * NOTE: window.location.href is returning the frame URL for frames and not the tab URL
 **/
function matchesCurrentURL (urlPattern) {
	// match special regex characters
	const pattern = urlPattern.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, (match) => {
		// replace * with .* -> matches anything 0 or more times, else escape character
		return match === '*' ? '.*' : '\\'+match;
	});
	// ^ matches beginning of input and $ matches ending of input
	return new RegExp('^'+pattern+'$').test(window.location.href);
}
