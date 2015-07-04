/* global $, Windows, MSApp, navigator, chrome, FastClick */
/* global StatusBar, networkinterface, links, SunCalc, md5, sjcl */

// Initialize global variables
var isIEMobile = /IEMobile/.test( navigator.userAgent ),
    isAndroid = /Android|\bSilk\b/.test( navigator.userAgent ),
    isiOS = /iP(ad|hone|od)/.test( navigator.userAgent ),
    isFireFoxOS = /^.*?\Mobile\b.*?\Firefox\b.*?$/m.test( navigator.userAgent ),
    isFireFox = /Firefox/.test( navigator.userAgent ),
    isWinApp = /MSAppHost/.test( navigator.userAgent ),
    isBB10 = /BB10/.test( navigator.userAgent ),
    isOSXApp = isOSXApp || false,
    isChromeApp = typeof chrome === "object" && typeof chrome.storage === "object",
    isFileCapable = !isiOS && !isAndroid && !isIEMobile && !isOSXApp && !isFireFoxOS &&
                    !isWinApp && !isBB10 && window.FileReader,
    isTouchCapable = "ontouchstart" in window || "onmsgesturechange" in window,

    // Small wrapper to handle Chrome vs localStorage usage
    storage = {
        get: function( query, callback ) {
            callback = callback || function() {};

            if ( isChromeApp ) {
                chrome.storage.local.get( query, callback );
            } else {
                var data = {},
                    i;

                if ( typeof query === "string" ) {
					query = [ query ];
                }

                for ( i in query ) {
                    if ( query.hasOwnProperty( i ) ) {
                        data[query[i]] = localStorage.getItem( query[i] );
                    }
                }

                callback( data );
            }
        },
        set: function( query, callback ) {
            callback = callback || function() {};

            if ( isChromeApp ) {
                chrome.storage.local.set( query, callback );
            } else {
                var i;
                if ( typeof query === "object" ) {
                    for ( i in query ) {
                        if ( query.hasOwnProperty( i ) ) {
                            localStorage.setItem( i, query[i] );
                        }
                    }
                }

                callback( true );
            }
        },
        remove: function( query, callback ) {
            callback = callback || function() {};

            if ( isChromeApp ) {
                chrome.storage.local.remove( query, callback );
            } else {
                var i;

				if ( typeof query === "string" ) {
                    query = [ query ];
                }

                for ( i in query ) {
                    if ( query.hasOwnProperty( i ) ) {
                        localStorage.removeItem( query[i] );
                    }
                }

                callback( true );
            }
        }
    },

    // Define the status bar color(s) and use a darker color for Android
    statusBarPrimary = isAndroid ? "#121212" : "#1D1D1D",
    statusBarOverlay = isAndroid ? "#151515" : "#202020",

    // Define the amount of times the app will retry an HTTP request before marking it failed
    retryCount = 2,

    // Initialize controller array which will store JSON data
    controller = {},
    switching = false,
    currentCoordinates = [ 0, 0 ],

    // Array to hold all notifications currently displayed within the app
    notifications = [],
    timers = {},
    curr183, currIp, currPrefix, currAuth, currPass, currPiWeather, currAuthUser,
    currAuthPass, currLocal, currLang, language, deviceip, errorTimeout, weather, weatherKeyFail, openPanel;

// Redirect jQuery Mobile DOM manipulation to prevent error
if ( isWinApp ) {

    // Add link to privacy statement
    var settingsPane = Windows.UI.ApplicationSettings.SettingsPane.getForCurrentView();

    // Bind the privacy policy to the settings panel
    settingsPane.addEventListener( "commandsrequested", function( eventArgs ) {
        var applicationCommands = eventArgs.request.applicationCommands;
        var privacyCommand = new Windows.UI.ApplicationSettings.SettingsCommand(
			"privacy", "Privacy Policy", function() {
				window.open( "https://albahra.com/journal/privacy-policy" );
			}
        );
        applicationCommands.append( privacyCommand );
    } );

    // Cache the old domManip function.
    $.fn.oldDomManIp = $.fn.domManip;

    // Override the domManip function with a call to the cached
    // domManip function wrapped in a MSapp.execUnsafeLocalFunction call.
    $.fn.domManip = function( args, callback, allowIntersection ) {
        var that = this;
        return MSApp.execUnsafeLocalFunction( function() {
            return that.oldDomManIp( args, callback, allowIntersection );
        } );
    };
}

$( document )
.one( "deviceready", function() {
    try {

        //Change the status bar to match the headers
        StatusBar.overlaysWebView( false );
        StatusBar.styleLightContent();
        StatusBar.backgroundColorByHexString( statusBarPrimary );

        $.mobile.window.on( "statusTap", function() {
			$( "body, html" ).animate( {
				scrollTop: 0
			}, 700 );
        } );
    } catch ( err ) {}

    // Hide the splash screen
    setTimeout( function() {
        try {
            navigator.splashscreen.hide();
        } catch ( err ) {}
    }, 500 );

    // For Android, Blackberry and Windows Phone devices catch the back button and redirect it
    $.mobile.document.on( "backbutton", function() {
        if ( isIEMobile && $.mobile.document.data( "iabOpen" ) ) {
            return false;
        }
        checkChangesBeforeBack();
        return false;
    } );
} )
.one( "mobileinit", function() {

    //Change history method for Chrome Packaged Apps
    if ( isChromeApp ) {
        $.mobile.hashListeningEnabled = false;
    }
} )
.on( "pagebeforechange", function( e, data ) {
    var page = data.toPage,
        currPage = $( ".ui-page-active" ),
        hash;

    // Pagebeforechange event triggers twice (before and after)
    // and this check ensures we get the before state
    if ( typeof data.toPage !== "string" ) {
        return;
    }

    // Grabs the new page hash
    hash = $.mobile.path.parseUrl( page ).hash;

    if ( currPage.length > 0 && hash === "#" + currPage.attr( "id" ) ) {
        return;
    }

    // Animations are patchy if the page isn't scrolled to the top.
    // This scrolls the page before the animation fires off.
    if ( data.options.role !== "popup" && !$( ".ui-popup-active" ).length ) {
        $.mobile.silentScroll( 0 );
    }

    // Cycle through page possibilities and call their init functions
    if ( hash === "#programs" ) {
        getPrograms( data.options.programToExpand );
    } else if ( hash === "#addprogram" ) {
        addProgram( data.options.copyID );
    } else if ( hash === "#manual" ) {
        getManual();
    } else if ( hash === "#about" ) {
        showAbout();
    } else if ( hash === "#runonce" ) {
        getRunonce();
    } else if ( hash === "#os-options" ) {
        showOptions( data.options.expandItem );
    } else if ( hash === "#preview" ) {
        getPreview();
    } else if ( hash === "#logs" ) {
        getLogs();
    } else if ( hash === "#forecast" ) {
        showForecast();
    } else if ( hash === "#loadingPage" ) {
        checkConfigured( true );
    } else if ( hash === "#start" ) {
		showStart();
    } else if ( hash === "#site-control" ) {
        showSites();
    } else if ( hash === "#weather_settings" ) {
        showWeatherSettings();
    } else if ( hash === "#sprinklers" ) {
        if ( $( hash ).length === 0 ) {
            showHome( data.options.firstLoad );
        } else {
            $( hash ).one( "pageshow", refreshStatus );
        }
    }
} )

// Handle OS resume event triggered by PhoneGap
.on( "resume", function() {

    // If we don't have a current device IP set, there is nothing else to update
    if ( currIp === undefined ) {
        return;
    }

    // If cloud token is available then sync sites
    cloudSync();

    // Indicate the weather and device status are being updated
    showLoading( "#weather,#footer-running" );

    updateController( updateWeather, networkFail );
} )
.on( "pause", function() {

    // Handle application being paused/closed
} )
.on( "pagebeforeshow", function( e ) {
    var newpage = "#" + e.target.id;

    // Modify the header and footer visibility before page show event
    if ( newpage === "#start" || newpage === "#loadingPage" ) {

		// Hide the header, footer and menu button on the start page
        $( "#header,#footer,#footer-menu" ).hide();
    } else {

		// Show header, footer and menu button on all other pages
        $( "#header,#footer,#footer-menu" ).show();
    }
} )
.on( "pageshow", function( e ) {
    var newpage = "#" + e.target.id,
        $newpage = $( newpage );

    // Fix issues between jQuery Mobile and FastClick
    fixInputClick( $newpage );

    if ( isControllerConnected() && newpage !== "#site-control" && newpage !== "#start" && newpage !== "#loadingPage" ) {

        // Update the controller status every 5 seconds and the program and station data every 30 seconds
        var refreshStatusInterval = setInterval( refreshStatus, 5000 ),
			refreshDataInterval = setInterval( refreshData, 20000 );

        $newpage.one( "pagehide", function() {
            clearInterval( refreshStatusInterval );
            clearInterval( refreshDataInterval );
        } );
    }
} )
.on( "popupafteropen", function() {

	// When a popup opens that has an overlay, update the status bar background color to match
    if ( $( ".ui-overlay-b:not(.ui-screen-hidden)" ).length ) {
        try {
            StatusBar.backgroundColorByHexString( statusBarOverlay );
        } catch ( err ) {}
    }
} )
.on( "popupafterclose", function() {

	$( ".ui-page-active" ).children().add( "#sprinklers-settings" ).removeClass( "blur-filter" );

	// When a popup is closed, change the header back to the default color
    try {
        StatusBar.backgroundColorByHexString( statusBarPrimary );
    } catch ( err ) {}
} )
.on( "popupbeforeposition", function() {
	$( ".ui-page-active" ).children().add( "#sprinklers-settings" ).addClass( "blur-filter" );
} )
.on( "popupbeforeposition", "#localization", checkCurrLang )
.one( "pagebeforeshow", "#loadingPage", initApp );

function initApp() {

    //Update the language on the page using the browser's locale
    updateLang();

    //Set AJAX timeout
    if ( !currLocal ) {
        $.ajaxSetup( {
            timeout: 10000
        } );
    }

    // Fix CSS for IE Mobile (Windows Phone 8)
    if ( isIEMobile ) {
        insertStyle( ".ui-toolbar-back-btn{display:none!important}ul{list-style:none!important;}" );
    }

    // Fix CSS for Chrome Web Store apps
    if ( isChromeApp ) {
        insertStyle( "html,body{overflow-y:scroll}" );
    }

    // Prevent caching of AJAX requests on Android and Windows Phone devices
    if ( isAndroid ) {

        // Hide the back button for Android (all devices have back button)
        insertStyle( ".ui-toolbar-back-btn{display:none!important}" );

        $( this ).ajaxStart( function() {
            try {
                navigator.app.clearCache();
            } catch ( err ) {}
        } );
    } else if ( isFireFoxOS || isFireFox ) {

        // Allow cross domain AJAX requests in FireFox OS
        $.ajaxSetup( {
            xhr: function() {
                return new window.XMLHttpRequest( {
                    mozSystem: true
                } );
            }
        } );
    } else {
        $.ajaxSetup( {
            "cache": false
        } );
    }

    //After jQuery mobile is loaded set initial configuration
    $.mobile.defaultPageTransition =
		( isAndroid || isIEMobile || isFireFoxOS || isBB10 ) ? "fade" : "slide";
    $.mobile.hoverDelay = 0;
    $.mobile.activeBtnClass = "activeButton";

    if ( !isOSXApp ) {

		// Handle In-App browser requests (marked with iab class)
        $.mobile.document.on( "click", ".iab", function() {
            var button = $( this ),
                iab = window.open( this.href, "_blank", "location=" + ( isAndroid ? "yes" : "no" ) +
					",enableViewportScale=" + ( button.hasClass( "iabNoScale" ) ? "no" : "yes" ) +
					",toolbarposition=top" +
					",closebuttoncaption=" +
						( button.hasClass( "iabNoScale" ) ? _( "Back" ) : _( "Done" ) )
				);

            if ( isIEMobile ) {

				// For Windows Mobile, save state of In-App browser to allow back button to close it
                $.mobile.document.data( "iabOpen", true );
                iab.addEventListener( "exit", function() {
                    $.mobile.document.removeData( "iabOpen" );
                } );
            }

            setTimeout( function() {
                button.removeClass( "ui-btn-active" );
            }, 100 );
            return false;
        } );
    }

    // Correctly handle popup events and prevent history navigation on custom selectmenu popup
    $.mobile.document.on( "click", ".ui-select .ui-btn", function() {
        var button = $( this ),
            id = button.attr( "id" ).replace( "-button", "-listbox" ),
            popup = $( "#" + id );

        popup.popup( "destroy" ).detach().addClass( "ui-page-theme-a" );
        $.mobile.pageContainer.append( popup );

        popup.popup( {
            history: false,
            "positionTo": button,
            overlayTheme: "b"
        } ).popup( "open" );

        button.off( "click" ).on( "click", function() {
            popup.popup( "open" );
        } );

        return false;
    } );

    // Bind event handler to open panel when swiping right
    $.mobile.document.on( "swiperight swipeleft", ".ui-page", function( e ) {
        var page = $( ".ui-page-active" );

        if ( page.jqmData( "panel" ) !== "open" && !page.find( ".ui-popup-active" ).length ) {
            if ( e.type === "swiperight" ) {
                openPanel();
            } else {
                showNotifications();
            }
        }
    } );

    // Extend collapsible widget with event before change
    $.widget( "mobile.collapsible", $.mobile.collapsible, {
        _handleExpandCollapse: function( isCollapse ) {
            if ( this._trigger( "before" + ( isCollapse ? "collapse" : "expand" ) ) ) {
                this._superApply( arguments );
            }
        }
    } );

    //Update site based on selector
    $( "#site-selector" ).on( "change", function() {
        updateSite( $( this ).val() );
    } );

    // Bind footer menu button
    $( "#footer-menu" ).on( "click", function() {
        showHomeMenu( this );
    } );

    // Initialize the app header
    $( "#header,#footer" ).toolbar();

    //Attach FastClick handler
    FastClick.attach( document.body );

    // Start interval loop which will update timers/clocks
    updateTimers();

    // Handle keybinds
    $.mobile.document.on( "keydown", function( e ) {
        if ( $( e.target ).closest( "input" )[0] ) {
            return;
        }

	    var code = event.keyCode,
			altDown = event.altKey,
			menuOpen = $( "#mainMenu-popup" ).hasClass( "ui-popup-active" );

        if ( code === 77 ) {
            var menu = $( "#mainMenu" );
            if ( menu.length > 0 ) {
                $( "#mainMenu" ).popup( "close" );
            } else {
                showHomeMenu();
            }
        } else if ( ( menuOpen || altDown ) && code === 80 ) {
			event.preventDefault();
			changePage( "#programs" );
        } else if ( ( menuOpen || altDown ) && code === 79 ) {
			event.preventDefault();
			changePage( "#os-options" );
        } else if ( ( menuOpen || altDown ) && code === 86 ) {
			event.preventDefault();
			changePage( "#preview" );
        } else if ( ( menuOpen || altDown ) && code === 76 ) {
			event.preventDefault();
			changePage( "#logs" );
        } else if ( ( menuOpen || altDown ) && code === 82 ) {
			event.preventDefault();
			changePage( "#runonce" );
        } else if ( ( menuOpen || altDown ) && code === 68 ) {
			event.preventDefault();
			showRainDelay();
		}
    } );

    // Initialize external panel
    bindPanel();

	// Update the IP address of the device running the app
	if ( !currLocal ) {
		updateDeviceIP();
	}

    // If cloud token is available then sync sites
    cloudSync();

    //On initial load check if a valid site exists for auto connect
    setTimeout( function() {
        checkConfigured( true );
    }, 200 );
}

// Handle main switches for manual mode
function flipSwitched() {
    if ( switching ) {
        return;
    }

    //Find out what the switch was changed to
    var flip = $( this ),
        id = flip.attr( "id" ),
        changedTo = flip.is( ":checked" ),
        method = ( id === "mmm" ) ? "mm" : id,
        defer;

    if ( changedTo ) {
        defer = sendToOS( "/cv?pw=&" + method + "=1" );
    } else {
        defer = sendToOS( "/cv?pw=&" + method + "=0" );
    }

    $.when( defer ).then( function() {
        refreshStatus();
        if ( id === "mmm" ) {
            $( "#mm_list .green" ).removeClass( "green" );
        }
        checkStatus();
    },
    function() {
        switching = true;
        setTimeout( function() {
            switching = false;
        }, 200 );
        flip.prop( "checked", !changedTo ).flipswitch( "refresh" );
    } );
}

// Wrapper function to communicate with OpenSprinkler
function sendToOS( dest, type ) {

    // Inject password into the request
    dest = dest.replace( "pw=", "pw=" + encodeURIComponent( currPass ) );
    type = type || "text";

    // Designate AJAX queue based on command type
    var isChange = /\/(?:cv|cs|cr|cp|uwa|dp|co|cl|cu|up|cm)/.exec( dest ),
		queue = isChange ? "change" : "default",
        obj = {
            url: currPrefix + currIp + dest,

            // Use POST when sending data to the controller (requires firmware 2.1.5 or newer)
            // TODO: Change GET to POST once OpenSprinkler supports it
            type: ( isChange && checkOSVersion( 216 ) ) ? "GET" : "GET",
            dataType: type,
            shouldRetry: function( xhr, current ) {
                if ( xhr.status === 0 && xhr.statusText === "abort" || retryCount < current ) {
                    $.ajaxq.abort( queue );
                    return false;
                }
                return true;
            }
        },
        defer;

    if ( currAuth ) {
        $.extend( obj, {
            beforeSend: function( xhr ) {
				xhr.setRequestHeader(
					"Authorization", "Basic " + btoa( currAuthUser + ":" + currAuthPass )
				);
            }
        } );
    }

    if ( curr183 ) {

		// Firmware 1.8.3 has a bug handling the time stamp in the GET request
        $.extend( obj, {
            cache: "true"
        } );
    }

    defer = $.ajaxq( queue, obj ).then(
        function( data ) {

            // In case the data type was incorrect, attempt to fix.
            // If fix not possible, return string
            if ( typeof data === "string" ) {
                try {
                    data = $.parseJSON( data );
                } catch ( e ) {
                    return data;
                }
            }

            // Don't need to handle this situation for OSPi or firmware below 2.1.0
            if ( typeof data !== "object" || typeof data.result !== "number" ) {
                return data;
            }

            // Return as successful
            if ( data.result === 1 ) {
                return data;

            // Handle incorrect password
            } else if ( data.result === 2 ) {
                if ( /\/(?:cv|cs|cr|cp|uwa|dp|co|cl|cu|up|cm)/.exec( dest ) ) {
                    showerror( _( "Check device password and try again." ) );
                }

                // Tell subsequent handlers this request has failed (use 401 to prevent retry)
                return $.Deferred().reject( { "status":401 } );

            // Handle page not found by triggering fail
            } else if ( data.result === 32 ) {

                return $.Deferred().reject( { "status":404 } );
            }

            // Only show error messages on setting change requests
            if ( /\/(?:cv|cs|cr|cp|uwa|dp|co|cl|cu|up|cm)/.exec( dest ) ) {
                if ( data.result === 48 ) {
                    showerror(
						_( "The selected station is already running or is scheduled to run." )
                    );
                } else {
                    showerror( _( "Please check input and try again." ) );
                }

                // Tell subsequent handlers this request has failed
                return $.Deferred().reject( data );
            }

        },
        function( e ) {
            if ( ( e.statusText === "timeout" || e.status === 0 ) && /\/(?:cv|cs|cr|cp|uwa|dp|co|cl|cu|cm)/.exec( dest ) ) {

                // Handle the connection timing out but only show error on setting change
                showerror( _( "Connection timed-out. Please try again." ) );
            } else if ( e.status === 401 ) {

                //Handle unauthorized requests
                showerror( _( "Check device password and try again." ) );
            }
            return;
        }
    );

    return defer;
}

function networkFail() {
    changeStatus( 0, "red", "<p class='running-text center'>" + _( "Network Error" ) + "</p>",
		function() {
			showLoading( "#weather,#footer-running" );
			refreshStatus();
			updateWeather();
		}
	);
}

// Gather new controller information and load home page
function newload() {

	// Get the current site name from the site select drop down
    var name = $( "#site-selector" ).val(),
        loading = "<div class='logo'></div>" +
			"<h1 style='padding-top:5px'>" + _( "Connecting to" ) + " " + name + "</h1>" +
			"<p class='cancel tight center inline-icon'>" +
				"<span class='btn-no-border ui-btn ui-icon-delete ui-btn-icon-notext'></span>" +
				"Cancel" +
			"</p>";

    $.mobile.loading( "show", {
        html: currLocal ? "<h1>" + _( "Loading" ) + "</h1>" : loading,
        textVisible: true,
        theme: "b"
    } );

    $( ".ui-loader" ).css( {
        "box-shadow": "none",
        "margin-top": "-4em"
    } ).find( ".cancel" ).one( "click", function() {
        $.ajaxq.abort( "default" );
        changePage( "#site-control", {
            transition: "none"
        } );
    } );

    //Empty object which will store device data
    controller = {};

    //Empty notifications
    clearNotifications();

    //Empty timers object
    timers = {};

    //Clear the current queued AJAX requests (used for previous controller connection)
    $.ajaxq.abort( "default" );

    updateController(
        function() {
            var weatherAdjust = $( ".weatherAdjust" ),
                changePassword = $( ".changePassword" );

            $.mobile.loading( "hide" );
            updateWeather();

            if ( checkOSVersion( 210 ) ) {
                weatherAdjust.css( "display", "" );
            } else {
                weatherAdjust.hide();
            }

            // Hide change password feature for unsupported devices
            if ( isOSPi() || checkOSVersion( 208 ) ) {
                changePassword.css( "display", "" );
            } else {
                changePassword.hide();
            }

            // Show site name instead of default Information bar
            if ( !currLocal ) {
                $( "#info-list" ).find( "li[data-role='list-divider']" ).text( name );
                document.title = "OpenSprinkler - " + name;
            } else {
                $( "#info-list" ).find( "li[data-role='list-divider']" ).text( _( "Information" ) );
            }

            // Check if a firmware update is available
            checkFirmwareUpdate();

            // Check if password is plain text (older method) and hash the password, if needed
            if ( checkOSVersion( 213 ) && controller.options.hwv !== 255 ) {
                fixPasswordHash( name );
            }

            // Check if the OpenSprinkler can be accessed from the public IP
            if ( !currLocal && typeof controller.settings.eip === "number" ) {
                checkPublicAccess( controller.settings.eip );
            }

            // Check if a cloud token is available and if so show logout button otherwise show login
            if ( !currLocal ) {
                updateLoginButtons();
            }

            // Check if automatic rain delay plugin is enabled on OSPi devices
            checkWeatherPlugin();

            if ( isOSPi() ) {

	            // Show notification of unified firmware availability
				showUnifiedFirmwareNotification();
            }

            if ( controller.options.firstRun ) {
				showGuidedSetup();
	        } else {
	            goHome( true );
	        }
        },
        function( error ) {
            $.ajaxq.abort( "default" );
            controller = {};

            $.mobile.loading( "hide" );

            var fail = function() {
                if ( !currLocal ) {
					if ( $( ".ui-page-active" ).attr( "id" ) === "site-control" ) {
						showFail();
					} else {
	                    $.mobile.document.one( "pageshow", showFail );
	                    changePage( "#site-control", {
	                        transition: "none"
	                    } );
					}
                } else {
                    storage.remove( [ "sites" ], function() {
                        window.location.reload();
                    } );
                }
            },
            showFail = function() {
                showerror( _( "Unable to connect to" ) + " " + name, 3500 );
            };

            if ( typeof error === "object" && error.status === 401 ) {
                $( ".ui-popup-active" ).find( "[data-role='popup']" ).popup( "close" );

                changePassword( {
                    fixIncorrect: true,
                    name: name,
                    callback: newload,
                    cancel: fail
                } );
            } else {
                fail();
            }
        }
    );
}

// Update controller information
function updateController( callback, fail ) {
    callback = callback || function() {};
    fail = fail || function() {};

    $.when(
        updateControllerPrograms(),
        updateControllerStations(),
        updateControllerOptions(),
        updateControllerStatus(),
        updateControllerSettings()
    ).then( function() {
        $( "html" ).trigger( "datarefresh" );
        checkStatus();
        callback();
    }, fail );
}

function updateControllerPrograms( callback ) {
    callback = callback || function() {};

    if ( curr183 === true ) {

		// If the controller is using firmware 1.8.3, then parse the script tag for variables
        return sendToOS( "/gp?d=0" ).done( function( programs ) {
            var vars = programs.match( /(nprogs|nboards|mnp)=[\w|\d|.\"]+/g ),
                progs = /pd=\[\];(.*);/.exec( programs ),
                newdata = {}, tmp, prog;

            for ( var i = 0; i < vars.length; i++ ) {
                if ( vars[i] === "" ) {
                    continue;
                }
                tmp = vars[i].split( "=" );
                newdata[tmp[0]] = parseInt( tmp[1] );
            }

            newdata.pd = [];
            if ( progs !== null ) {
                progs = progs[1].split( ";" );
                for ( i = 0; i < progs.length; i++ ) {
                    prog = progs[i].split( "=" );
                    prog = prog[1].replace( "[", "" );
                    prog = prog.replace( "]", "" );
                    newdata.pd[i] = parseIntArray( prog.split( "," ) );
                }
            }

            controller.programs = newdata;
            callback();
        } );
    } else {
        return sendToOS( "/jp?pw=", "json" ).done( function( programs ) {
            controller.programs = programs;
            callback();
        } );
    }
}

function updateControllerStations( callback ) {
    callback = callback || function() {};

    if ( curr183 === true ) {

		// If the controller is using firmware 1.8.3, then parse the script tag for variables
        return sendToOS( "/vs" ).done( function( stations ) {
            var names = /snames=\[(.*?)\];/.exec( stations ),
                masop = stations.match( /(?:masop|mo)\s?[=|:]\s?\[(.*?)\]/ );

            names = names[1].split( "," );
            names.pop();

            for ( var i = 0; i < names.length; i++ ) {
                names[i] = names[i].replace( /'/g, "" );
            }

            masop = parseIntArray( masop[1].split( "," ) );

            controller.stations = {
                "snames": names,
                "masop": masop,
                "maxlen": names.length
            };
            callback();
        } );
    } else {
        return sendToOS( "/jn?pw=", "json" ).done( function( stations ) {
            controller.stations = stations;
            callback();
        } );
    }
}

function updateControllerOptions( callback ) {
    callback = callback || function() {};

    if ( curr183 === true ) {

		// If the controller is using firmware 1.8.3, then parse the script tag for variables
        return sendToOS( "/vo" ).done( function( options ) {
            var isOSPi = options.match( /var sd\s*=/ ),
                vars = {}, tmp, i, o;

            if ( isOSPi ) {
                var varsRegex = /(tz|htp|htp2|nbrd|seq|sdt|mas|mton|mtoff|urs|rst|wl|ipas)\s?[=|:]\s?([\w|\d|.\"]+)/gm,
                    name;

                while ( ( tmp = varsRegex.exec( options ) ) !== null ) {
                    name = tmp[1].replace( "nbrd", "ext" ).replace( "mtoff", "mtof" );
                    vars[name] = +tmp[2];
                }
                vars.ext--;
                vars.fwv = "1.8.3-ospi";
            } else {
                var keyIndex = {
					1:"tz", 2:"ntp", 12:"hp0", 13:"hp1", 14:"ar", 15:"ext", 16:"seq", 17:"sdt",
					18:"mas", 19:"mton", 20:"mtof", 21:"urs", 22:"rso", 23:"wl", 25:"ipas",
					26:"devid"
				},
				valid = [ 1, 2, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26 ];
                tmp = /var opts=\[(.*)\];/.exec( options );
                tmp = tmp[1].replace( /"/g, "" ).split( "," );

                for ( i = 0; i < tmp.length - 1; i = i + 4 ) {
                    o = +tmp[i + 3];
                    if ( $.inArray( o, valid ) !== -1 ) {
                        vars[keyIndex[o]] = +tmp[i + 2];
                    }
                }
                vars.fwv = 183;
            }
            controller.options = vars;
            callback();
        } );
    } else {
        return sendToOS( "/jo?pw=", "json" ).done( function( options ) {
            controller.options = options;
            callback();
        } );
    }
}

function updateControllerStatus( callback ) {
    callback = callback || function() {};

    if ( curr183 === true ) {

		// If the controller is using firmware 1.8.3, then parse the script tag for variables
        return sendToOS( "/sn0" ).then(
            function( status ) {
                var tmp = status.toString().match( /\d+/ );

                tmp = parseIntArray( tmp[0].split( "" ) );

                controller.status = tmp;
                callback();
            },
            function() {
                controller.status = [];
            } );
    } else {
        return sendToOS( "/js?pw=", "json" ).then(
            function( status ) {
                controller.status = status.sn;
                callback();
            },
            function() {
                controller.status = [];
            } );
    }
}

function updateControllerSettings( callback ) {
    callback = callback || function() {};

    if ( curr183 === true ) {

		// If the controller is using firmware 1.8.3, then parse the script tag for variables
        return sendToOS( "" ).then(
            function( settings ) {
                var varsRegex = /(ver|devt|nbrd|tz|en|rd|rs|mm|rdst|urs)\s?[=|:]\s?([\w|\d|.\"]+)/gm,
                    loc = settings.match( /loc\s?[=|:]\s?[\"|'](.*)[\"|']/ ),
                    lrun = settings.match( /lrun=\[(.*)\]/ ),
                    ps = settings.match( /ps=\[(.*)\];/ ),
                    vars = {}, tmp, i;

                ps = ps[1].split( "],[" );
                for ( i = ps.length - 1; i >= 0; i-- ) {
                    ps[i] = parseIntArray( ps[i].replace( /\[|\]/g, "" ).split( "," ) );
                }

                while ( ( tmp = varsRegex.exec( settings ) ) !== null ) {
                    vars[tmp[1]] = +tmp[2];
                }

                vars.loc = loc[1];
                vars.ps = ps;
                vars.lrun = parseIntArray( lrun[1].split( "," ) );

                controller.settings = vars;
            },
            function() {
                if ( controller.settings && controller.stations ) {
                    var ps = [], i;
                    for ( i = 0; i < controller.stations.maxlen; i++ ) {
                        ps.push( [ 0, 0 ] );
                    }
                    controller.settings.ps = ps;
                }
            } );
    } else {
        return sendToOS( "/jc?pw=" ).then(
            function( settings ) {
                if ( typeof settings !== "object" ) {
                    try {
                        settings = JSON.parse( settings );
                    } catch ( err ) {
                        settings = settings.replace( /,"wto":\{.*\}/, "" );
                        try {
                            settings = JSON.parse( settings );
                        } catch ( e ) {
                            return false;
                        }
                    }
                }

                if ( typeof settings.lrun === "undefined" ) {
                    settings.lrun = [ 0, 0, 0, 0 ];
                }
                controller.settings = settings;
                callback();
            },
            function() {
                if ( controller.settings && controller.stations ) {
                    var ps = [], i;
                    for ( i = 0; i < controller.stations.maxlen; i++ ) {
                        ps.push( [ 0, 0 ] );
                    }
                    controller.settings.ps = ps;
                }
            } );
    }
}

// Multi site functions
function checkConfigured( firstLoad ) {
    storage.get( [ "sites", "current_site", "cloudToken" ], function( data ) {
        var sites = data.sites,
            current = data.current_site,
            names;

        sites = parseSites( sites );

        names = Object.keys( sites );

        if ( !names.length ) {
            if ( firstLoad ) {
                if ( data.cloudToken === undefined || data.cloudToken === null ) {
                    changePage( "#start", {
                        transition: "none"
                    } );
                } else {
                    changePage( "#site-control", {
                        transition: "none"
                    } );
                }
            }
            return;
        }

        if ( current === null || !( current in sites ) ) {
            $.mobile.loading( "hide" );
            changePage( "#site-control", {
                transition: firstLoad ? "none" : undefined
            } );
            return;
        }

        updateSiteList( names, current );

        currIp = sites[current].os_ip;
        currPass = sites[current].os_pw;

        if ( typeof sites[current].ssl !== "undefined" && sites[current].ssl === "1" ) {
            currPrefix = "https://";
        } else {
            currPrefix = "http://";
        }

        if ( typeof sites[current].auth_user !== "undefined" &&
			typeof sites[current].auth_pw !== "undefined" ) {

            currAuth = true;
            currAuthUser = sites[current].auth_user;
            currAuthPass = sites[current].auth_pw;
        } else {
            currAuth = false;
        }

        if ( sites[current].is183 ) {
            curr183 = true;
        } else {
            curr183 = false;
        }

        newload();
    } );
}

function fixPasswordHash( current ) {
    storage.get( [ "sites" ], function( data ) {
        var sites = parseSites( data.sites );

        if ( !isMD5( currPass ) ) {
            var pw = md5( currPass );

            sendToOS(
				"/sp?pw=&npw=" + encodeURIComponent( pw ) +
				"&cpw=" + encodeURIComponent( pw ), "json"
            ).done( function( info ) {
                var result = info.result;

                if ( !result || result > 1 ) {
                    return false;
                } else {
                    sites[current].os_pw = currPass = pw;
                    storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
                }
            } );
        }
    } );
}

// Add a new site
function submitNewUser( ssl, useAuth ) {
    document.activeElement.blur();
    $.mobile.loading( "show" );

    var ip = $.mobile.path.parseUrl( $( "#os_ip" ).val() ).hrefNoHash.replace( /https?:\/\//, "" ),
        success = function( data, sites ) {
            $.mobile.loading( "hide" );
            var is183;

            if ( ( typeof data === "string" && data.match( /var (en|sd)\s*=/ ) ) || ( typeof data.fwv === "number" && data.fwv === 203 ) ) {
                is183 = true;
            }

            if ( data.fwv !== undefined || is183 === true ) {
                var name = $( "#os_name" ).val(),
                    pw = $( "#os_pw" ).val(),
                    savePW = $( "#save_pw" ).is( ":checked" );

                if ( name === "" ) {
                    name = "Site " + ( Object.keys( sites ).length + 1 );
                }

                sites[name] = {};
                sites[name].os_ip = currIp = ip;

                if ( typeof data.fwv === "number" && data.fwv >= 213 ) {
                    if ( typeof data.wl === "number" ) {
                        pw = md5( pw );
                    }
                }

                sites[name].os_pw = savePW ? pw : "";
                currPass = pw;

                if ( ssl ) {
                    sites[name].ssl = "1";
                    currPrefix = "https://";
                } else {
                    currPrefix = "http://";
                }

                if ( useAuth ) {
                    sites[name].auth_user = $( "#os_auth_user" ).val();
                    sites[name].auth_pw = $( "#os_auth_pw" ).val();
                    currAuth = true;
                    currAuthUser = sites[name].auth_user;
                    currAuthPass = sites[name].auth_pw;
                } else {
                    currAuth = false;
                }

                if ( is183 === true ) {
                    sites[name].is183 = "1";
                    curr183 = true;
                }

                $( "#os_name,#os_ip,#os_pw,#os_auth_user,#os_auth_pw" ).val( "" );
                storage.set( {
                    "sites": JSON.stringify( sites ),
                    "current_site": name
                }, function() {
                    cloudSaveSites();
                    updateSiteList( Object.keys( sites ), name );
                    newload();
                } );
            } else {
                showerror( _( "Check IP/Port and try again." ) );
            }
        },
        fail = function( x ) {
            if ( !useAuth && x.status === 401 ) {
                getAuth();
                return;
            }
            if ( ssl ) {
                $.mobile.loading( "hide" );
                showerror( _( "Check IP/Port and try again." ) );
            } else {
                submitNewUser( true );
            }
        },
        getAuth = function() {
            if ( $( "#addnew-auth" ).length ) {
                submitNewUser( ssl, true );
            } else {
                showAuth();
            }
        },
        getAuthInfo = function() {
			return btoa( $( "#os_auth_user" ).val() + ":" + $( "#os_auth_pw" ).val() );
        },
        showAuth = function() {
            $.mobile.loading( "hide" );
            var html = $( "<div class='ui-content' id='addnew-auth'>" +
                    "<form method='post' novalidate>" +
                        "<p class='center smaller'>" + _( "Authorization Required" ) + "</p>" +
                        "<label for='os_auth_user'>" + _( "Username:" ) + "</label>" +
                        "<input autocomplete='off' autocorrect='off' autocapitalize='off' " +
							"spellcheck='false' type='text' " +
							"name='os_auth_user' id='os_auth_user'>" +
                        "<label for='os_auth_pw'>" + _( "Password:" ) + "</label>" +
                        "<input type='password' name='os_auth_pw' id='os_auth_pw'>" +
                        "<input type='submit' value='" + _( "Submit" ) + "'>" +
                    "</form>" +
                "</div>" ).enhanceWithin();

            html.on( "submit", "form", function() {
                submitNewUser( ssl, true );
                return false;
            } );

            $( "#addnew-content" ).hide();
            $( "#addnew" ).append( html ).popup( "reposition", { positionTo:"window" } );
        },
        prefix;

    if ( !ip ) {
        showerror( _( "An IP address is required to continue." ) );
        return;
    }

    if ( useAuth !== true && $( "#os_useauth" ).is( ":checked" ) ) {
        getAuth();
        return;
    }

    if ( $( "#os_usessl" ).is( ":checked" ) === true ) {
        ssl = true;
    }

    if ( ssl ) {
        prefix = "https://";
    } else {
        prefix = "http://";
    }

    if ( useAuth ) {
        $( "#addnew-auth" ).hide();
        $( "#addnew-content" ).show();
        $( "#addnew" ).popup( "reposition", { positionTo:"window" } );
    }

    //Submit form data to the server
    $.ajax( {
        url: prefix + ip + "/jo?pw=" + md5( $( "#os_pw" ).val() ),
        type: "GET",
        dataType: "json",
        timeout: 10000,
        global: false,
        beforeSend: function( xhr ) {
            if ( useAuth ) {
                xhr.setRequestHeader(
					"Authorization",
					"Basic " + getAuthInfo()
				);
            }
        },
        error: function( x ) {
            if ( !useAuth && x.status === 401 ) {
                getAuth();
                return;
            }
            $.ajax( {
                url: prefix + ip,
                type: "GET",
                dataType: "text",
                timeout: 10000,
                global: false,
                cache: true,
                beforeSend: function( xhr ) {
                    if ( useAuth ) {
                        xhr.setRequestHeader(
							"Authorization",
							"Basic " + getAuthInfo()
						);
                    }
                },
                success: function( reply ) {
                    storage.get( "sites", function( data ) {
                        var sites = parseSites( data.sites );
                        success( reply, sites );
                    } );
                },
                error: fail
            } );
        },
        success: function( reply ) {
            storage.get( "sites", function( data ) {
                var sites = parseSites( data.sites );
                success( reply, sites );
            } );
        }
    } );
}

function parseSites( sites ) {
	return ( sites === undefined || sites === null ) ? {} : JSON.parse( sites );
}

function showSiteSelect( list ) {
    $( "#site-select" ).popup( "destroy" ).remove();

    var popup = $(
		"<div data-role='popup' id='site-select' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + _( "Select Site" ) + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<ul data-role='none' class='ui-listview ui-corner-all ui-shadow'>" +
                "</ul>" +
            "</div>" +
        "</div>" );

    if ( list ) {
        popup.find( "ul" ).html( list );
    }

    popup.one( "popupafterclose", function() {
        $( this ).popup( "destroy" ).remove();
    } ).popup( {
        history: false,
        "positionTo": "window"
    } ).enhanceWithin().popup( "open" );
}

function showAddNew( autoIP, closeOld ) {
    $( "#addnew" ).popup( "destroy" ).remove();

    var isAuto = ( autoIP ) ? true : false,
        addnew = $( "<div data-role='popup' id='addnew' data-theme='a' data-overlay-theme='b'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + _( "New Device" ) + "</h1>" +
            "</div>" +
            "<div class='ui-content' id='addnew-content'>" +
                "<form method='post' novalidate>" +
                    ( isAuto ? "" : "<p class='center smaller'>" +
						_( "Note: The name is used to identify the OpenSprinkler within the app. OpenSprinkler IP can be either an IP or hostname. You can also specify a port by using IP:Port" ) +
					"</p>" ) +
                    "<label for='os_name'>" + _( "Open Sprinkler Name:" ) + "</label>" +
                    "<input autocorrect='off' spellcheck='false' type='text' name='os_name' " +
						"id='os_name' placeholder='Home'>" +
                    ( isAuto ? "" :
						"<label for='os_ip'>" + _( "Open Sprinkler IP:" ) + "</label>" ) +
                    "<input " + ( isAuto ? "data-role='none' style='display:none' " : "" ) +
						"autocomplete='off' autocorrect='off' autocapitalize='off' " +
						"spellcheck='false' type='url' pattern='' name='os_ip' id='os_ip' " +
						"value='" + ( isAuto ? autoIP : "" ) + "' placeholder='home.dyndns.org'>" +
                    "<label for='os_pw'>" + _( "Open Sprinkler Password:" ) + "</label>" +
                    "<input type='password' name='os_pw' id='os_pw' value=''>" +
                    "<label for='save_pw'>" + _( "Save Password" ) + "</label>" +
                    "<input type='checkbox' data-wrapper-class='save_pw' name='save_pw' " +
						"id='save_pw' data-mini='true' checked='checked'>" +
                    ( isAuto ? "" :
						"<div data-theme='a' data-mini='true' data-role='collapsible'>" +
							"<h4>" + _( "Advanced" ) + "</h4>" +
							"<fieldset data-role='controlgroup' data-type='horizontal' " +
								"data-mini='true' class='center'>" +
							"<input type='checkbox' name='os_usessl' id='os_usessl'>" +
							"<label for='os_usessl'>" + _( "Use SSL" ) + "</label>" +
							"<input type='checkbox' name='os_useauth' id='os_useauth'>" +
							"<label for='os_useauth'>" + _( "Use Auth" ) + "</label>" +
							"</fieldset>" +
						"</div>" ) +
                    "<input type='submit' data-theme='b' value='" + _( "Submit" ) + "'>" +
                "</form>" +
            "</div>" +
        "</div>" );

    addnew.find( "form" ).on( "submit", function() {
        submitNewUser();
        return false;
    } );

    addnew.one( "popupafterclose", function() {
        $( this ).popup( "destroy" ).remove();
    } ).popup( {
        history: false,
        "positionTo": "window"
    } ).enhanceWithin();

    if ( closeOld ) {
        $( ".ui-popup-active" ).children().first().one( "popupafterclose", function() {
            addnew.popup( "open" );
        } ).popup( "close" );
    } else {
        addnew.popup( "open" );
    }

    fixInputClick( addnew );

    addnew.find( ".ui-collapsible-heading-toggle" ).on( "click", function() {
        var open = $( this ).parents( ".ui-collapsible" ).hasClass( "ui-collapsible-collapsed" ),
            page = $( ".ui-page-active" ),
            height = parseInt( page.css( "min-height" ) );

        if ( open ) {
            page.css( "min-height", ( height + 65 ) + "px" );
        } else {
            page.css( "min-height", ( height - 65 ) + "px" );
        }

        addnew.popup( "reposition", { positionTo:"window" } );
    } );

    return false;
}

var showSites = ( function() {
    var page = $( "<div data-role='page' id='site-control'>" +
            "<div class='ui-content'>" +
            "</div>" +
        "</div>" ),
        makeStart = function() {
            var finish = function() {
                header.eq( 0 ).hide();
                $( "#header" ).show();
                $( "#footer, #footer-menu" ).hide();
            };

            if ( page.hasClass( "ui-page-active" ) ) {
                finish();
            } else {
                page.one( "pagebeforeshow", function( e ) {
                    e.stopImmediatePropagation();
                    finish();
                } );
            }

            page.on( "swiperight swipeleft", function( e ) {
                e.stopImmediatePropagation();
            } );

            document.title = "OpenSprinkler";
        },
        popup = $( "<div data-role='popup' id='addsite' data-theme='b'>" +
            "<ul data-role='listview'>" +
                "<li data-icon='false'>" +
					"<a href='#' id='site-add-scan'>" + _( "Scan For Device" ) + "</a>" +
                "</li>" +
                "<li data-icon='false'>" +
					"<a href='#' id='site-add-manual'>" + _( "Manually Add Device" ) + "</a>" +
                "</li>" +
            "</ul>" +
        "</div>" ),
        sites, header, total;

    popup.find( "#site-add-scan" ).on( "click", function() {
        popup.popup( "close" );
        startScan();
        return false;
    } );

    popup.find( "#site-add-manual" ).on( "click", function() {
        showAddNew( false, true );
        return false;
    } );

    page.on( "pagehide", function() {
		popup.detach();
        page.detach();
    } );

    page.one( "pagebeforeshow", function() {
		$.mobile.pageContainer.append( popup );

	    popup.popup( {
	        history: false,
	        positionTo: header.eq( 2 )
	    } ).enhanceWithin();
    } );

    $( "html" ).on( "siterefresh", function() {
		if ( page.hasClass( "ui-page-active" ) ) {
			updateContent();
		}
    } );

    function updateContent() {
	    storage.get( [ "sites", "current_site", "cloudToken" ], function( data ) {
			sites = parseSites( data.sites );

	        if ( $.isEmptyObject( sites ) ) {
	            if ( typeof data.cloudToken !== "string" ) {
	                changePage( "#start" );

	                return;
	            } else {
	                makeStart();
	                page.find( ".ui-content" ).html( "<p class='center'>" +
						_( "Please add a site by tapping the 'Add' button in the top right corner." ) +
					"</p>" );
	            }
	        } else {
	            var list = "<div data-role='collapsible-set'>",
	                siteNames = [],
	                i = 0;

	            total = Object.keys( sites ).length;

	            if ( !isControllerConnected() || !total || !( data.current_site in sites ) ) {
	                makeStart();
	            }

	            sites = sortObj( sites );

	            $.each( sites, function( a, b ) {
	                siteNames.push( a );

	                a = htmlEscape( a );

	                list += "<fieldset " + ( ( total === 1 ) ? "data-collapsed='false'" : "" ) + " id='site-" + i + "' data-role='collapsible'>" +
	                    "<h3>" +
							"<a class='ui-btn ui-btn-corner-all connectnow yellow' data-site='" + i + "' href='#'>" +
								_( "connect" ) +
							"</a>" +
						a + "</h3>" +
	                    "<form data-site='" + i + "' novalidate>" +
	                        "<div class='ui-field-contain'>" +
	                            "<label for='cnm-" + i + "'>" + _( "Change Name" ) + "</label><input id='cnm-" + i + "' type='text' value='" + a + "'>" +
	                        "</div>" +
	                        "<div class='ui-field-contain'>" +
	                            "<label for='cip-" + i + "'>" + _( "Change IP" ) + "</label><input id='cip-" + i + "' type='url' value='" + b.os_ip +
									"' autocomplete='off' autocorrect='off' autocapitalize='off' pattern='' spellcheck='false'>" +
	                        "</div>" +
	                        "<div class='ui-field-contain'>" +
	                            "<label for='cpw-" + i + "'>" + _( "Change Password" ) + "</label><input id='cpw-" + i + "' type='password'>" +
	                        "</div>" +
	                        "<fieldset data-mini='true' data-role='collapsible'>" +
	                            "<h3>" +
									"<span style='line-height:23px'>" + _( "Advanced" ) + "</span>" +
									"<button data-helptext='" +
										_( "These options are only for an OpenSprinkler behind a proxy capable of SSL and/or Basic Authentication." ) +
										"' class='collapsible-button-right help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
								"</h3>" +
	                            "<label for='usessl-" + i + "'>" +
									"<input data-mini='true' type='checkbox' id='usessl-" + i + "' name='usessl-" + i + "'" +
										( typeof b.ssl !== "undefined" && b.ssl === "1" ? " checked='checked'" : "" ) + ">" +
									_( "Use SSL" ) +
								"</label>" +
	                            "<label for='useauth-" + i + "'>" +
									"<input class='useauth' data-user='" + b.auth_user + "' data-pw='" + b.auth_pw +
										"' data-mini='true' type='checkbox' id='useauth-" + i + "' name='useauth-" + i + "'" +
										( typeof b.auth_user !== "undefined" && typeof b.auth_pw !== "undefined" ? " checked='checked'" : "" ) + ">" +
									_( "Use Auth" ) +
								"</label>" +
	                        "</fieldset>" +
	                        "<input class='submit' type='submit' value='" + _( "Save Changes to" ) + " " + a + "'>" +
	                        "<a data-role='button' class='deletesite' data-site='" + i + "' href='#' data-theme='b'>" + _( "Delete" ) + " " + a + "</a>" +
	                    "</form>" +
	                "</fieldset>";

	                testSite( b, i, function( id, result ) {
	                    page.find( "#site-" + id + " .connectnow" )
							.removeClass( "yellow" )
							.addClass( result ? "green" : "red" );
	                } );

	                i++;
	            } );

	            list = $( list + "</div>" );

	            list.find( "form" ).one( "change input", function() {
	                $( this ).find( ".submit" ).addClass( "hasChanges" );
	            } );

	            list.find( ".connectnow" ).on( "click", function() {
	                updateSite( siteNames[$( this ).data( "site" )] );
	                return false;
	            } );

	            list.find( ".help-icon" ).on( "click", showHelpText );

	            list.find( ".useauth" ).on( "change", function() {
	                var el = $( this );

	                if ( el.is( ":checked" ) ) {
	                    var popup = $( "<div data-role='popup' data-theme='a'>" +
	                        "<form method='post' class='ui-content' novalidate>" +
	                            "<label for='auth_user'>" + _( "Username:" ) + "</label>" +
	                            "<input autocomplete='off' autocorrect='off' autocapitalize='off' " +
									"spellcheck='false' type='text' name='auth_user' id='auth_user'>" +
	                            "<label for='auth_pw'>" + _( "Password:" ) + "</label>" +
	                            "<input type='password' name='auth_pw' id='auth_pw'>" +
	                            "<input type='submit' class='submit' value='" + _( "Submit" ) + "'>" +
	                        "</form>" +
	                        "</div>" ).enhanceWithin(),
	                        didSubmit = false;

	                    popup.find( ".submit" ).on( "click", function() {
	                        el.data( {
	                            user: popup.find( "#auth_user" ).val(),
	                            pw: popup.find( "#auth_pw" ).val()
	                        } );

	                        didSubmit = true;
	                        popup.popup( "close" );
	                        return false;
	                    } );

	                    popup.one( "popupafterclose", function() {
	                        if ( !didSubmit ) {
	                            el.attr( "checked", false ).checkboxradio( "refresh" );
	                        }
	                    } );

	                    openPopup( popup );
	                } else {
	                    el.data( {
	                        user: "",
	                        pw: ""
	                    } );
	                }
	            } );

	            list.find( "form" ).on( "submit", function() {
	                var form = $( this ),
	                    id = form.data( "site" ),
	                    site = siteNames[id],
	                    ip = list.find( "#cip-" + id ).val(),
	                    pw = list.find( "#cpw-" + id ).val(),
	                    nm = list.find( "#cnm-" + id ).val(),
	                    useauth = list.find( "#useauth-" + id ).is( ":checked" ),
	                    usessl = list.find( "#usessl-" + id ).is( ":checked" ) ? "1" : undefined,
	                    authUser = list.find( "#useauth-" + id ).data( "user" ),
	                    authPass = list.find( "#useauth-" + id ).data( "pw" ),
	                    needsReconnect = ( ip !== "" && ip !== sites[site].os_ip ) ||
											usessl !== sites[site].ssl ||
											authUser !== sites[site].auth_user ||
											authPass !== sites[site].auth_pw,
	                    isCurrent = ( site === data.current_site ),
	                    rename = ( nm !== "" && nm !== site );

	                form.find( ".submit" ).removeClass( "hasChanges" );

	                if ( useauth ) {
	                    sites[site].auth_user = authUser;
	                    sites[site].auth_pw = authPass;
	                } else {
	                    delete sites[site].auth_user;
	                    delete sites[site].auth_pw;
	                }

	                if ( usessl === "1" ) {
	                    sites[site].ssl = usessl;
	                } else {
	                    delete sites[site].ssl;
	                }

	                if ( ip !== "" && ip !== sites[site].os_ip ) {
	                    sites[site].os_ip = ip;
	                }
	                if ( pw !== "" && pw !== sites[site].os_pw ) {
	                    if ( isMD5( sites[site].os_pw ) ) {
	                        pw = md5( pw );
	                    }
	                    sites[site].os_pw = pw;
	                }
	                if ( rename ) {
	                    sites[nm] = sites[site];
	                    delete sites[site];
	                    site = nm;
	                    if ( isCurrent ) {
	                        storage.set( { "current_site":site } );
	                        data.current_site = site;
	                    }
	                    updateSiteList( Object.keys( sites ), data.current_site );
	                }

	                storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );

	                showerror( _( "Site updated successfully" ) );

	                if ( site === data.current_site ) {
	                    if ( pw !== "" ) {
	                        currPass = pw;
	                    }
	                    if ( needsReconnect ) {
	                        checkConfigured();
	                    }
	                }

	                if ( rename && !form.find( ".submit" ).hasClass( "preventUpdate" ) ) {
	                    updateContent();
	                }

	                return false;
	            } );

	            list.find( ".deletesite" ).on( "click", function() {
	                var site = siteNames[$( this ).data( "site" )];

                    if ( $( "#site-selector" ).val() === site ) {
                        makeStart();
                    }

	                delete sites[site];
	                storage.set( { "sites":JSON.stringify( sites ) }, function() {
	                    cloudSaveSites();
	                    updateSiteList( Object.keys( sites ), data.current_site );
	                    if ( $.isEmptyObject( sites ) ) {
		                    storage.get( "cloudToken", function() {
			                    if ( data.cloudToken === null || data.cloudToken === undefined ) {
									currIp = "";
									currPass = "";
			                        changePage( "#start" );
									return;
								}
							} );
						} else {
		                    updateContent();
		                    showerror( _( "Site deleted successfully" ) );
	                    }
	                    return false;
	                } );

	                return false;
	            } );

	            page.find( ".ui-content" ).html( list.enhanceWithin() );
	        }

	        if ( typeof data.cloudToken === "string" ) {
	            page.find( ".ui-content" ).prepend( addSyncStatus( data.cloudToken ) );

	        }
	    } );
	}

	function begin() {
        header = changeHeader( {
            title: _( "Manage Sites" ),
            animate: isControllerConnected() ? true : false,
            leftBtn: {
                icon: "carat-l",
                text: _( "Back" ),
                class: "ui-toolbar-back-btn",
                on: function() {
                    page.find( ".hasChanges" ).addClass( "preventUpdate" );
                    checkChangesBeforeBack();
                }
            },
            rightBtn: {
                icon: "plus",
                text: _( "Add" ),
                on: function() {
                    if ( typeof deviceip === "undefined" ) {
                        showAddNew();
                    } else {
                        popup.popup( "open" ).popup( "reposition", {
                            positionTo: header.eq( 2 )
                        } );
                    }
                }
            }
        } );

	    updateContent();

	    $( "#site-control" ).remove();
	    $.mobile.pageContainer.append( page );
	}

	return begin;
} )();

function addSyncStatus( token ) {
    var ele = $( "<div class='ui-bar smaller ui-bar-a ui-corner-all logged-in-alert'>" +
            "<div class='inline ui-btn ui-icon-recycle btn-no-border ui-btn-icon-notext ui-mini'></div>" +
            "<div class='inline syncStatus'>" + _( "Synced with OpenSprinkler.com" ) + " (" + getTokenUser( token ) + ")</div>" +
            "<div class='inline ui-btn ui-icon-delete btn-no-border ui-btn-icon-notext ui-mini logout'></div>" +
        "</div>" );

    ele.find( ".logout" ).on( "click", logout );
    ele.find( ".ui-icon-recycle" ).on( "click", function() {
        var btn = $( this );

        btn.addClass( "spin" );
        cloudSync( function() {
            btn.removeClass( "spin" );
        } );
    } );
    return ele;
}

function testSite( site, id, callback ) {
    $.ajax( {
        url: ( site.ssl === "1" ? "https://" : "http://" ) + site.os_ip + "/jo?pw=" + encodeURIComponent( site.os_pw ),
        type: "GET",
        dataType: "json",
        beforeSend: function( xhr ) {
            if ( typeof site.auth_user !== "undefined" && typeof site.auth_pw !== "undefined" ) {
                xhr.setRequestHeader( "Authorization", "Basic " + btoa( site.auth_user + ":" + site.auth_pw ) );
            }
        }
    } ).then(
        function() {
            callback( id, true );
        },
        function() {
            callback( id, false );
        }
    );
}

// Update the panel list of sites
function updateSiteList( names, current ) {
    var list = "",
        select = $( "#site-selector" );

    $.each( names, function() {
        list += "<option " + ( this.toString() === current ? "selected " : "" ) + "value='" + htmlEscape( this ) + "'>" + this + "</option>";
    } );

    $( "#info-list" ).find( "li[data-role='list-divider']" ).text( current );

    select.html( list );
    if ( select.parent().parent().hasClass( "ui-select" ) ) {
        select.selectmenu( "refresh" );
    }
}

// Change the current site
function updateSite( newsite ) {
    storage.get( "sites", function( data ) {
        var sites = parseSites( data.sites );
        if ( newsite in sites ) {
            closePanel( function() {
                storage.set( { "current_site":newsite }, checkConfigured );
            } );
        }
    } );
}

// Automatic device detection functions
function updateDeviceIP( finishCheck ) {
    var finish = function( result ) {
		deviceip = result;

		if ( typeof finishCheck === "function" ) {
			finishCheck( result );
		}
    },
    ip;

    if ( isChromeApp ) {
        chrome.system.network.getNetworkInterfaces( function( data ) {
            var i;
            for ( i in data ) {
                if ( data.hasOwnProperty( i ) ) {
                    if ( /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test( data[i].address ) ) {
                        ip = data[i].address;
                    }
                }
            }

            finish( ip );
        } );
    } else {
        try {

            // Request the device's IP address
            networkinterface.getIPAddress( function( data ) {
                ip = data;
                finish( ip );
            } );
        } catch ( err ) {
            findRouter( function( status, data ) {
				finish( !status ? undefined : data );
            } );
        }
    }
}

function isLocalIP( ip ) {
    var chk = parseIntArray( ip.split( "." ) );

    // Check if the IP is on a private network, if not don't enable automatic scanning
    return ( chk[0] === 10 || chk[0] === 127 || ( chk[0] === 172 && chk[1] > 17 && chk[1] < 32 ) || ( chk[0] === 192 && chk[1] === 168 ) );
}

function startScan( port, type ) {

    // type represents the OpenSprinkler model as defined below
    // 0 - OpenSprinkler using firmware 2.0+
    // 1 - OpenSprinkler Pi using 1.9+
    // 2 - OpenSprinkler using firmware 1.8.3
    // 3 - OpenSprinkler Pi using 1.8.3

    var ip = deviceip.split( "." ),
        scanprogress = 1,
        devicesfound = 0,
        newlist = "",
        suffix = "",
        oldips = [],
        isCanceled = false,
        i, url, notfound, found, baseip, checkScanStatus, scanning, dtype, text;

    type = type || 0;
    port = ( typeof port === "number" ) ? port : 80;

    storage.get( "sites", function( data ) {
        var oldsites = parseSites( data.sites ),
            i;

        for ( i in oldsites ) {
            if ( oldsites.hasOwnProperty( i ) ) {
                oldips.push( oldsites[i].os_ip );
            }
        }
    } );

    notfound = function() {
        scanprogress++;
    };

    found = function( reply ) {
        scanprogress++;
        var ip = $.mobile.path.parseUrl( this.url ).authority,
            fwv, tmp;

        if ( $.inArray( ip, oldips ) !== -1 ) {
            return;
        }

        if ( this.dataType === "text" ) {
            tmp = reply.match( /var\s*ver=(\d+)/ );
            if ( !tmp ) {
                return;
            }
            fwv = tmp[1];
        } else {
            if ( !reply.hasOwnProperty( "fwv" ) ) {
                return;
            }
            fwv = reply.fwv;
        }

        devicesfound++;

        newlist += "<li><a class='ui-btn ui-btn-icon-right ui-icon-carat-r' href='#' data-ip='" + ip + "'>" + ip +
				"<p>" + _( "Firmware" ) + ": " + getOSVersion( fwv ) + "</p>" +
			"</a></li>";
    };

    // Check if scanning is complete
    checkScanStatus = function() {
        if ( isCanceled === true ) {
            $.mobile.loading( "hide" );
            clearInterval( scanning );
            return false;
        }

        if ( scanprogress === 245 ) {
            $.mobile.loading( "hide" );
            clearInterval( scanning );
            if ( !devicesfound ) {
                if ( type === 0 ) {
                    startScan( 8080, 1 );

                } else if ( type === 1 ) {
                    startScan( 80, 2 );

                } else if ( type === 2 ) {
                    startScan( 8080, 3 );

                } else {
                    showerror( _( "No new devices were detected on your network" ) );
                }
            } else {
                newlist = $( newlist );

                newlist.find( "a" ).on( "click", function() {
                    addFound( $( this ).data( "ip" ) );
                    return false;
                } );

                showSiteSelect( newlist );
            }
        }
    };

    ip.pop();
    baseip = ip.join( "." );

    if ( type === 0 ) {
        text = _( "Scanning for OpenSprinkler" );
    } else if ( type === 1 ) {
        text = _( "Scanning for OpenSprinkler Pi" );
    } else if ( type === 2 ) {
        text = _( "Scanning for OpenSprinkler (1.8.3)" );
    } else if ( type === 3 ) {
        text = _( "Scanning for OpenSprinkler Pi (1.8.3)" );
    }

    $.mobile.loading( "show", {
        html: "<h1>" + text + "</h1><p class='cancel tight center inline-icon'>" +
			"<span class='btn-no-border ui-btn ui-icon-delete ui-btn-icon-notext'></span>" + _( "Cancel" ) + "</p>",
        textVisible: true,
        theme: "b"
    } );

    $( ".ui-loader" ).find( ".cancel" ).one( "click", function() {
        isCanceled = true;
    } );

    // Start scan
    for ( i = 1; i <= 244; i++ ) {
        ip = baseip + "." + i;
        if ( type < 2 ) {
            suffix = "/jo";
            dtype = "json";
        } else {
            dtype = "text";
        }
        url = "http://" + ip + ( ( port && port !== 80 ) ? ":" + port : "" ) + suffix;
        $.ajax( {
            url: url,
            type: "GET",
            dataType: dtype,
            timeout: 6000,
            global: false,
            error: notfound,
            success: found
        } );
    }
    scanning = setInterval( checkScanStatus, 200 );
}

function findRouter( callback ) {
    callback = callback || function() {};

    var routerIPs = [ "192.168.1.1", "10.0.1.1", "192.168.1.220", "192.168.2.1", "10.1.1.1", "192.168.11.1", "192.168.0.1",
					"192.168.0.30", "192.168.0.50", "192.168.10.1", "192.168.20.1", "192.168.30.1", "192.168.62.1", "192.168.102.1",
					"192.168.1.254", "192.168.0.227", "10.0.0.138", "192.168.123.254", "192.168.4.1", "10.0.0.2", "10.0.2.1",
					"10.0.3.1", "10.0.4.1", "10.0.5.1" ],
        total = routerIPs.length,
        scanprogress = 0,
        reply = function( status, ip ) {
            scanprogress++;
            if ( status === true ) {
                routerFound = ip;
            }
        },
        checkScanStatus = function() {
            if ( scanprogress === total || typeof routerFound === "string" ) {
                clearInterval( scanning );
                if ( typeof routerFound === "string" ) {
                    callback( true, routerFound );
                } else {
                    callback( false );
                }
            }
        },
        scanning, routerFound, i;

    for ( i = 0; i < total; i++ ) {
        if ( typeof routerFound !== "string" ) {
            ping( routerIPs[i], reply );
        }
    }
    scanning = setInterval( checkScanStatus, 50 );
}

function ping( ip, callback ) {
    callback = callback || function() {};

    if ( !ip || ip === "" ) {
        callback( false );
    }

    $.ajax( {
        url: "http://" + ip,
        type: "GET",
        timeout: 6000,
        global: false
    } ).then(
        function() {
            callback( true, ip );
        },
        function( e ) {
            if ( e.statusText === "timeout" ) {
                callback( false );
            } else {
                callback( true, ip );
            }
        }
    );
}

// Show popup for new device after populating device IP with selected result
function addFound( ip ) {
    $( "#site-select" ).one( "popupafterclose", function() {
        showAddNew( ip );
    } ).popup( "close" );
}

// Weather functions
function showWeatherSettings() {
    var page = $( "<div data-role='page' id='weather_settings'>" +
        "<div class='ui-content' role='main'>" +
            "<ul data-role='listview' data-inset='true'>" +
                "<li>" +
                    "<label for='weather_provider'>" + _( "Weather Provider" ) + "</label>" +
                    "<select data-mini='true' id='weather_provider'>" +
                        "<option value='yahoo' " + ( currPiWeather.weather_provider === "yahoo" ? "selected" : "" ) + ">" + _( "Yahoo!" ) + "</option>" +
                        "<option value='wunderground' " + ( currPiWeather.weather_provider === "wunderground" ? "selected" : "" ) + ">" +
							_( "Wunderground" ) +
						"</option>" +
                    "</select>" +
                    "<label " + ( currPiWeather.weather_provider === "wunderground" ? "" : "style='display:none' " ) + "for='wapikey'>" +
						_( "Wunderground API Key" ) +
					"</label>" +
					"<input " + ( currPiWeather.weather_provider === "wunderground" ? "" : "style='display:none' " ) + "data-mini='true' " +
						"autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' type='text' " +
						"id='wapikey' value='" + currPiWeather.wapikey + "'>" +
                "</li>" +
            "</ul>" +
            "<ul data-role='listview' data-inset='true'> " +
                "<li>" +
                    "<p class='rain-desc'>" +
						_( "When automatic rain delay is enabled, the weather will be checked for rain every hour. If the weather reports any condition suggesting rain, a rain delay is automatically issued using the below set delay duration." ) +
					"</p>" +
                    "<div class='ui-field-contain'>" +
                        "<label for='auto_delay'>" + _( "Auto Rain Delay" ) + "</label>" +
                        "<input type='checkbox' data-on-text='On' data-off-text='Off' data-role='flipswitch' " +
							"name='auto_delay' id='auto_delay' " + ( currPiWeather.auto_delay === "on" ? "checked" : "" ) + ">" +
                    "</div>" +
                    "<div class='ui-field-contain duration-input'>" +
                        "<label for='delay_duration'>" + _( "Delay Duration" ) + "</label>" +
                        "<button id='delay_duration' data-mini='true' value='" + ( currPiWeather.delay_duration * 3600 ) + "'>" +
							dhms2str( sec2dhms( currPiWeather.delay_duration * 3600 ) ) +
						"</button>" +
                    "</div>" +
                "</li>" +
            "</ul>" +
            "<a class='wsubmit' href='#' data-role='button' data-theme='b' type='submit'>" + _( "Submit" ) + "</a>" +
        "</div>" +
    "</div>" ),
    submitWeatherSettings = function() {
        var url = "/uwa?auto_delay=" +
			( $( "#auto_delay" ).is( ":checked" ) ? "on" : "off" ) + "&delay_duration=" + parseInt( $( "#delay_duration" ).val() / 3600 ) +
			"&weather_provider=" + $( "#weather_provider" ).val() + "&wapikey=" + $( "#wapikey" ).val();

        $.mobile.loading( "show" );

        sendToOS( url ).then(
            function() {
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Weather settings have been saved" ) );
                } );
                goBack();
                checkWeatherPlugin();
            },
            function() {
                showerror( _( "Weather settings were not saved. Please try again." ) );
            }
        );

        return false;
    };

    //Handle provider select change on weather settings
    page.find( "#weather_provider" ).on( "change", function() {
        var val = $( this ).val();
        if ( val === "wunderground" ) {
            page.find( "#wapikey,label[for='wapikey']" ).show( "fast" );
            page.find( "#wapikey" ).parent( ".ui-input-text" ).css( "border-style", "solid" );
        } else {
            page.find( "#wapikey,label[for='wapikey']" ).hide( "fast" );
            page.find( "#wapikey" ).parent( ".ui-input-text" ).css( "border-style", "none" );
        }
    } );

    page.find( ".wsubmit" ).on( "click", submitWeatherSettings );

    page.find( "#delay_duration" ).on( "click", function() {
        var dur = $( this ),
            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text();

        showDurationBox( {
            seconds: dur.val(),
            title: name,
            callback: function( result ) {
                dur.val( result );
                dur.text( dhms2str( sec2dhms( result ) ) );
            },
            maximum: 345600,
            granularity:2
        } );
    } );

    page.one( {
        pagehide: function() {
            page.detach();
        },
        pagebeforeshow: function() {
            if ( currPiWeather.weather_provider !== "wunderground" ) {
                page.find( "#wapikey" ).parent( ".ui-input-text" ).css( "border-style", "none" );
            }
        }
    } );

    changeHeader( {
        title: _( "Weather Settings" ),
        leftBtn: {
            icon: "carat-l",
            text: _( "Back" ),
            class: "ui-toolbar-back-btn",
            on: goBack
        },
        rightBtn: {
            icon: "check",
            text: _( "Submit" ),
            on: submitWeatherSettings
        }
    } );

    $( "#weather_settings" ).remove();
    $.mobile.pageContainer.append( page );
}

function showAdjustmentOptions( button, callback ) {
    $( ".ui-popup-active" ).find( "[data-role='popup']" ).popup( "close" );

    var options = controller.settings.wto;

    if ( typeof options !== "object" || $.isEmptyObject( options ) ) {
        options = {
            h: 100,
            t: 100,
            r: 100
        };
    }

    var popup = $( "<div data-role='popup' data-theme='a' id='adjustmentOptions'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + _( "Weather Adjustment Options" ) + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<p class='rain-desc center smaller'>" +
                    _( "Modify the weight of each factor when calculating the scale" ) +
                "</p>" +
                "<span>" +
                    "<fieldset class='ui-grid-b incr'>" +
                        "<div class='ui-block-a'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                    "</fieldset>" +
                    "<div class='ui-grid-b inputs'>" +
                        "<div class='ui-block-a'>" +
                            "<label class='center'>" +
                                _( "Temp" ) + " (%)" +
                            "</label>" +
                            "<input data-wrapper-class='pad_buttons' class='t' type='number' pattern='[0-9]{3}' value='" + options.t + "'>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<label class='center'>" +
                                _( "Rain" ) + " (%)" +
                            "</label>" +
                            "<input data-wrapper-class='pad_buttons' class='r' type='number' pattern='[0-9]{3}' value='" + options.r + "'>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<label class='center'>" +
                                _( "Humidity" ) + " (%)" +
                            "</label>" +
                            "<input data-wrapper-class='pad_buttons' class='h' type='number' pattern='[0-9]{3}' value='" + options.h + "'>" +
                        "</div>" +
                    "</div>" +
                    "<fieldset class='ui-grid-b decr'>" +
                        "<div class='ui-block-a'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                    "</fieldset>" +
                "</span>" +
                "<button class='submit' data-theme='b'>" + _( "Submit" ) + "</button>" +
            "</div>" +
        "</div>" ),
        changeValue = function( pos, dir ) {
            var input = popup.find( ".inputs input" ).eq( pos ),
                val = parseInt( input.val() );

            if ( ( dir === -1 && val === 0 ) || ( dir === 1 && val === 100 ) ) {
                return;
            }

            input.val( val + dir );
        };

    popup.find( ".submit" ).on( "click", function() {
        options = {
            h: parseInt( popup.find( ".h" ).val() ),
            t: parseInt( popup.find( ".t" ).val() ),
            r: parseInt( popup.find( ".r" ).val() )
        };

        if ( button ) {
            button.value = escapeJSON( options );
        }

        callback();

        popup.popup( "close" );
        return false;
    } );

    popup.on( "focus", "input[type='number']", function() {
        this.value = "";
    } ).on( "blur", "input[type='number']", function() {
        if ( this.value === "" || parseInt( this.value ) < 0 ) {
            this.value = "0";
        }
    } );

    holdButton( popup.find( ".incr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, 1 );
        return false;
    } );

    holdButton( popup.find( ".decr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, -1 );
        return false;
    } );

    $( "#adjustmentOptions" ).remove();

    popup.css( "max-width", "380px" );

    openPopup( popup, { positionTo: "window" } );
}

function convertTemp( temp, region ) {
    if ( region === "United States" || region === "Bermuda" || region === "Palau" ) {
        temp = temp + "&#176;F";
    } else {
        temp = parseInt( Math.round( ( temp - 32 ) * ( 5 / 9 ) ) ) + "&#176;C";
    }
    return temp;
}

function hideWeather() {
    $( "#weather" ).empty().parents( ".info-card" ).addClass( "noweather" );
}

function updateWeather() {
    if ( typeof controller.settings.wtkey !== "undefined" && controller.settings.wtkey !== "" ) {
        updateWundergroundWeather( controller.settings.wtkey );
        return;
    }

    storage.get( [ "provider", "wapikey" ], function( data ) {
        if ( controller.settings.loc === "" ) {
            hideWeather();
            return;
        }

        showLoading( "#weather" );

        if ( data.provider === "wunderground" && data.wapikey ) {
            updateWundergroundWeather( data.wapikey );
        } else {
            updateYahooWeather();
        }
    } );
}

function updateYahooWeather() {
    $.ajax( {
        url: "https://query.yahooapis.com/v1/public/yql?q=select%20woeid%20from%20geo.placefinder%20where%20text=%22" +
			encodeURIComponent( controller.settings.loc ) + "%22&format=json",
        dataType: isChromeApp ? "json" : "jsonp",
        contentType: "application/json; charset=utf-8",
        shouldRetry: retryCount,
        success: function( woeid ) {
            if ( woeid.query.results === null ) {
                hideWeather();
                return;
            }

            var wid;

            if ( typeof woeid.query.results.Result.woeid === "string" ) {
                wid = woeid.query.results.Result.woeid;
            } else {
                wid = woeid.query.results.Result[0].woeid;
            }

            $.ajax( {
                url: "https://query.yahooapis.com/v1/public/yql?q=select%20item%2Ctitle%2Clocation%20from%20weather.forecast%20where%20woeid%3D%22" +
					wid + "%22&format=json",
                dataType: isChromeApp ? "json" : "jsonp",
                contentType: "application/json; charset=utf-8",
                shouldRetry: retryCount,
                success: function( data ) {

                    // Hide the weather if no data is returned
                    if ( data.query.results.channel.item.title === "City not found" ) {
                        hideWeather();
                        return;
                    }
                    var now = data.query.results.channel.item.condition,
                        title = data.query.results.channel.title,
                        loc = /Yahoo! Weather - (.*)/.exec( title ),
                        region = data.query.results.channel.location.country;

                    currentCoordinates = [ data.query.results.channel.item.lat, data.query.results.channel.item.long ];

                    weather = {
                        title: now.text,
                        code: now.code,
                        temp: convertTemp( now.temp, region ),
                        location: loc[1],
                        forecast: data.query.results.channel.item.forecast,
                        region: region,
                        source: "yahoo"
                    };

                    updateWeatherBox();

                    $.mobile.document.trigger( "weatherUpdateComplete" );
                }
            } );
        }
    } );
}

function updateWeatherBox() {
    $( "#weather" )
        .html( "<div title='" + weather.title + "' class='wicon cond" + weather.code + "'></div>" +
			"<div class='inline tight'>" + weather.temp + "</div><br><div class='inline location tight'>" + weather.location + "</div>" )
        .off( "click" ).on( "click", function() {
            changePage( "#forecast" );
            return false;
        } )
        .parents( ".info-card" ).removeClass( "noweather" );
}

function updateWundergroundWeather( wapikey ) {
    $.ajax( {
        url: "https://api.wunderground.com/api/" + wapikey + "/conditions/forecast/lang:EN/q/" + encodeURIComponent( controller.settings.loc ) + ".json",
        dataType: isChromeApp ? "json" : "jsonp",
        contentType: "application/json; charset=utf-8",
        shouldRetry: retryCount,
        success: function( data ) {
            var code, temp;

            if ( typeof data.response.error === "object" && data.response.error.type === "keynotfound" ) {
                weatherKeyFail = true;
                updateYahooWeather();
                return;
            } else {
                weatherKeyFail = false;
            }

            if ( data.current_observation.icon_url.indexOf( "nt_" ) !== -1 ) {
                code = "nt_" + data.current_observation.icon;
            } else {
                code = data.current_observation.icon;
            }

            var wwForecast = {
                "condition": {
                    "text": data.current_observation.weather,
                    "code": code,
                    "temp_c": data.current_observation.temp_c,
                    "temp_f": data.current_observation.temp_f,
                    "date": data.current_observation.observation_time,
                    "precip_today_in": data.current_observation.precip_today_in,
                    "precip_today_metric": data.current_observation.precip_today_metric
                },
                "location": data.current_observation.display_location.full,
                "region": data.current_observation.display_location.country_iso3166,
                simpleforecast: {}
            };

            currentCoordinates = [ data.current_observation.observation_location.latitude, data.current_observation.observation_location.longitude ];

            $.each( data.forecast.simpleforecast.forecastday, function( k, attr ) {
                 wwForecast.simpleforecast[k] = attr;
            } );

            if ( wwForecast.region === "US" || wwForecast.region === "BM" || wwForecast.region === "PW" ) {
                temp = Math.round( wwForecast.condition.temp_f ) + "&#176;F";
            } else {
                temp = wwForecast.condition.temp_c + "&#176;C";
            }

            weather = {
                title: wwForecast.condition.text,
                code: code,
                temp: temp,
                forecast: wwForecast,
                source: "wunderground"
            };

            coordsToLocation( currentCoordinates[0], currentCoordinates[1], function( result ) {
                weather.location = result;
                updateWeatherBox();
            }, wwForecast.location );

            $.mobile.document.trigger( "weatherUpdateComplete" );
        }
    } );
}

function coordsToLocation( lat, lon, callback, fallback ) {
    $.getJSON( "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lon, function( data ) {
        if ( data.results.length === 0 ) {
            callback( fallback );
        }

        data = data.results;

        var hasEnd = false;

        for ( var item in data ) {
            if ( data.hasOwnProperty( item ) ) {
                if ( $.inArray( "locality", data[item].types ) > -1 || $.inArray( "sublocality", data[item].types ) > -1 ) {
                    hasEnd = true;
                    break;
                }
            }
        }

        if ( hasEnd === false ) {
            callback( fallback );
        }

        data = data[item].address_components;

        var location = "",
            country = "";

        hasEnd = false;

        for ( item in data ) {
            if ( data.hasOwnProperty( item ) && !hasEnd ) {
                if ( location === "" && $.inArray( "locality", data[item].types ) > -1 ) {
                    location = data[item].long_name + ", " + location;
                }

                if ( location === "" && $.inArray( "sublocality", data[item].types ) > -1 ) {
                    location = data[item].long_name + ", " + location;
                }

                if ( $.inArray( "administrative_area_level_1", data[item].types ) > -1 ) {
                    location += data[item].long_name;
                    hasEnd = true;
                }

                if ( $.inArray( "country", data[item].types ) > -1 ) {
                    country = data[item].long_name;
                }
            }
        }

        if ( !hasEnd ) {
            location += country;
        }

        callback( location );
    } );
}

function getSunTimes( date ) {
    date = date || new Date( controller.settings.devt * 1000 );

    var times = SunCalc.getTimes( date, currentCoordinates[0], currentCoordinates[1] ),
        sunrise = times.sunrise,
        sunset = times.sunset,
        tzOffset = getTimezoneOffset();

    sunrise.setUTCMinutes( sunrise.getUTCMinutes() + tzOffset );
	sunset.setUTCMinutes( sunset.getUTCMinutes() + tzOffset );

    sunrise = ( sunrise.getUTCHours() * 60 + sunrise.getUTCMinutes() );
    sunset = ( sunset.getUTCHours() * 60 + sunset.getUTCMinutes() );

    return [ sunrise, sunset ];
}

function showForecast() {
    var page = $( "<div data-role='page' id='forecast'>" +
            "<div class='ui-content' role='main'>" +
                "<ul data-role='listview' data-inset='true'>" +
                    ( weather.source === "wunderground" ? makeWundergroundForecast() : makeYahooForecast() ) +
                "</ul>" +
            "</div>" +
        "</div>" );

    changeHeader( {
        title: _( "Forecast" ),
        leftBtn: {
            icon: "carat-l",
            text: _( "Back" ),
            class: "ui-toolbar-back-btn",
            on: goBack
        },
        rightBtn: {
            icon: "refresh",
            text: _( "Refresh" ),
            on: function() {
                $.mobile.loading( "show" );
                $.mobile.document.one( "weatherUpdateComplete", function() {
                    $.mobile.loading( "hide" );
                } );
                updateWeather();
            }
        }
    } );

    page.one( "pagehide", function() {
        page.remove();
    } );

    $( "#forecast" ).remove();
    $.mobile.pageContainer.append( page );
}

function makeWundergroundForecast() {
    var temp, precip;

    if ( weather.forecast.region === "US" || weather.forecast.region === "BM" || weather.forecast.region === "PW" ) {
        temp = weather.forecast.condition.temp_f + "&#176;F";
        precip = weather.forecast.condition.precip_today_in + " in";
    } else {
        temp = weather.forecast.condition.temp_c + "&#176;C";
        precip = weather.forecast.condition.precip_today_metric + " mm";
    }

    var list = "<li data-role='list-divider' data-theme='a' class='center'>" + weather.location + "</li>";
    list += "<li data-icon='false' class='center'>" +
			"<div>" + _( "Now" ) + "</div><br>" +
			"<div title='" + weather.forecast.condition.text + "' class='wicon cond" + weather.forecast.condition.code + "'></div>" +
			"<span>" + temp + "</span><br>" +
			"<span>" + _( "Sunrise" ) + "</span><span>: " + pad( parseInt( controller.settings.sunrise / 60 ) % 24 ) + ":" + pad( controller.settings.sunrise % 60 ) + "</span> " +
			"<span>" + _( "Sunset" ) + "</span><span>: " + pad( parseInt( controller.settings.sunset / 60 ) % 24 ) + ":" + pad( controller.settings.sunset % 60 ) + "</span><br>" +
			"<span>" + _( "Precip" ) + "</span><span>: " + precip + "</span>" +
		"</li>";

    $.each( weather.forecast.simpleforecast, function( i ) {
        if ( i === "0" ) {
            return;
        }

        var times = getSunTimes( new Date( this.date.epoch * 1000 ) ),
            sunrise = times[0],
            sunset = times[1],
            precip;

        if ( weather.forecast.region === "US" || weather.forecast.region === "BM" || weather.forecast.region === "PW" ) {
            precip = this.qpf_allday["in"];
            if ( precip === null ) {
                precip = 0;
            }
            list += "<li data-icon='false' class='center'>" +
					"<div>" + this.date.monthname_short + " " + this.date.day + "</div><br>" +
					"<div title='" + this.conditions + "' class='wicon cond" + this.icon + "'></div>" +
					"<span>" + _( this.date.weekday_short ) + "</span><br>" +
					"<span>" + _( "Low" ) + "</span><span>: " + this.low.fahrenheit + "&#176;F  </span>" +
					"<span>" + _( "High" ) + "</span><span>: " + this.high.fahrenheit + "&#176;F</span><br>" +
					"<span>" + _( "Sunrise" ) + "</span><span>: " + pad( parseInt( sunrise / 60 ) % 24 ) + ":" + pad( sunrise % 60 ) + "</span> " +
					"<span>" + _( "Sunset" ) + "</span><span>: " + pad( parseInt( sunset / 60 ) % 24 ) + ":" + pad( sunset % 60 ) + "</span><br>" +
					"<span>" + _( "Precip" ) + "</span><span>: " + precip + " in</span>" +
				"</li>";
        } else {
            precip = this.qpf_allday.mm;
            if ( precip === null ) {
                precip = 0;
            }
            list += "<li data-icon='false' class='center'>" +
					"<div>" + this.date.monthname_short + " " + this.date.day + "</div><br>" +
					"<div title='" + this.conditions + "' class='wicon cond" + this.icon + "'></div>" +
					"<span>" + _( this.date.weekday_short ) + "</span><br>" +
					"<span>" + _( "Low" ) + "</span><span>: " + this.low.celsius + "&#176;C  </span>" +
					"<span>" + _( "High" ) + "</span><span>: " + this.high.celsius + "&#176;C</span><br>" +
					"<span>" + _( "Sunrise" ) + "</span><span>: " + pad( parseInt( sunrise / 60 ) % 24 ) + ":" + pad( sunrise % 60 ) + "</span> " +
					"<span>" + _( "Sunset" ) + "</span><span>: " + pad( parseInt( sunset / 60 ) % 24 ) + ":" + pad( controller.settings.sunset % 60 ) + "</span><br>" +
					"<span>" + _( "Precip" ) + "</span><span>: " + precip + " mm</span>" +
				"</li>";
        }
    } );

    return list;
}

function makeYahooForecast() {
    var list = "<li data-role='list-divider' data-theme='a' class='center'>" + weather.location + "</li>",
        sunrise = controller.settings.sunrise ? controller.settings.sunrise : getSunTimes()[0],
        sunset = controller.settings.sunset ? controller.settings.sunset : getSunTimes()[1],
        i;

    list += "<li data-icon='false' class='center'>" +
			"<div>" + _( "Now" ) + "</div><br>" +
			"<div title='" + weather.title + "' class='wicon cond" + weather.code + "'></div>" +
			"<span>" + weather.temp + "</span><br>" +
			"<span>" + _( "Sunrise" ) + "</span><span>: " + pad( parseInt( sunrise / 60 ) % 24 ) + ":" + pad( sunrise % 60 ) + "</span> " +
			"<span>" + _( "Sunset" ) + "</span><span>: " + pad( parseInt( sunset / 60 ) % 24 ) + ":" + pad( sunset % 60 ) + "</span>" +
		"</li>";

    for ( i = 1; i < weather.forecast.length; i++ ) {
        var times = getSunTimes( new Date( weather.forecast[i].date ) );

        sunrise = times[0];
        sunset = times[1];

        list += "<li data-icon='false' class='center'>" +
				"<div>" + weather.forecast[i].date + "</div><br>" +
				"<div title='" + weather.forecast[i].text + "' class='wicon cond" + weather.forecast[i].code + "'></div>" +
				"<span>" + _( weather.forecast[i].day ) + "</span><br>" +
				"<span>" + _( "Low" ) + "</span><span>: " + convertTemp( weather.forecast[i].low, weather.region ) + "  </span>" +
				"<span>" + _( "High" ) + "</span><span>: " + convertTemp( weather.forecast[i].high, weather.region ) + "</span><br>" +
				"<span>" + _( "Sunrise" ) + "</span><span>: " + pad( parseInt( sunrise / 60 ) % 24 ) + ":" + pad( sunrise % 60 ) + "</span> " +
				"<span>" + _( "Sunset" ) + "</span><span>: " + pad( parseInt( sunset / 60 ) % 24 ) + ":" + pad( sunset % 60 ) + "</span>" +
			"</li>";
    }

    return list;
}

function resolveLocation( loc, callback ) {

    // Looks up the location and shows a list possible matches for selection
    // Returns the selection to the callback
    $( "#location-list" ).popup( "destroy" ).remove();

    callback = callback || function() {};

    if ( !loc || loc === "" ) {
        callback( false );
        return;
    }

    $.ajax( {
        url: "https://autocomplete.wunderground.com/aq?format=json&h=0&query=" + encodeURIComponent( loc ),
        dataType: isChromeApp ? "json" : "jsonp",
        jsonp: "cb",
        shouldRetry: retryCount
    } ).done( function( data ) {
        data = data.RESULTS;

        if ( data.length === 0 ) {
            callback( false );
            return;
        } else if ( data.length === 1 ) {
            callback( data[0].name );
            return;
        }

        var items = "";

        for ( var i = 0; i < data.length; i++ ) {
            if ( data[i].type !== "city" || !data[i].tz ) {
                continue;
            }

            items += "<li><a>" + data[i].name + "</a></li>";
        }

        if ( items === "" ) {
            callback( false );
            return;
        }

        var popup = $( "<div data-role='popup' id='location-list' data-theme='a'>" +
                "<div data-role='header' data-theme='b'>" +
                    "<h1>" + _( "Select City" ) + "</h1>" +
                "</div>" +
                "<div class='ui-content'>" +
                    "<ul data-role='listview'>" +
                        items +
                    "</ul>" +
                "</div>" +
            "</div>" ),
            dataSent = false;

        popup.on( "click", "a", function() {
            callback( this.textContent );
            dataSent = true;
            popup.popup( "close" );
        } ).one( "popupafterclose", function() {
            if ( dataSent === false ) {
                callback( false );
            }
        } );

        openPopup( popup );
    } );
}

function nearbyPWS( lat, lon, callback ) {

    // Looks up the location and shows a list possible matches for selection
    // Returns the selection to the callback
    $( "#location-list" ).popup( "destroy" ).remove();
    $.mobile.loading( "show" );

    callback = callback || function() {};

    if ( !lat || !lon ) {
        callback( false );
        return;
    }

    $.ajax( {
        url: "https://api.wunderground.com/api/" + controller.settings.wtkey + "/geolookup/q/" +
			( lat === -999 || lon === -999 ? "autoip" : encodeURIComponent( lat ) + "," + encodeURIComponent( lon ) ) + ".json",
        dataType: isChromeApp ? "json" : "jsonp",
        shouldRetry: retryCount
    } ).done( function( data ) {
        var airports;

        lat = data.location.lat;
        lon = data.location.lon;

        try {
            airports = data.location.nearby_weather_stations.airport.station;
            data = data.location.nearby_weather_stations.pws.station;
        } catch ( err ) {
            callback( false );
            return;
        }

        if ( data.length === 0 ) {
            callback( false );
            return;
        } else if ( data.length === 1 ) {
            callback( data[0].id );
            return;
        }

        var prefix = "";
        data = encodeURIComponent( JSON.stringify( data ) );

        if ( currLocal ) {
            prefix = $.mobile.path.parseUrl( $( "head" ).find( "script[src$='app.jgz'],script[src$='app.js']" ).attr( "src" ) ).hrefNoHash.slice( 0, -10 );
        }

        var popup = $( "<div data-role='popup' id='location-list' data-theme='a' style='background-color:rgb(229, 227, 223);'>" +
                "<a href='#' data-rel='back' class='ui-btn ui-corner-all ui-shadow ui-btn-b ui-icon-delete ui-btn-icon-notext ui-btn-right'>" + _( "Close" ) + "</a>" +
                    "<iframe style='border:none' src='" + prefix + "map.htm' width='100%' height='100%' seamless=''></iframe>" +
            "</div>" ),
            iframe = popup.find( "iframe" ),
            dataSent = false;

        // Wire in listener for communication from iframe
        $.mobile.window.off( "message onmessage" ).on( "message onmessage", function( e ) {
            var data = e.originalEvent.data;
            if ( typeof data.WS !== "undefined" ) {
                callback( data.WS );
                dataSent = true;
                popup.popup( "destroy" ).remove();
            } else if ( typeof data.loaded !== "undefined" && data.loaded === true ) {
                $.mobile.loading( "hide" );
            }
        } );

        iframe.one( "load", function() {
            this.contentWindow.postMessage( {
                type: "currentLocation",
                payload: {
                    lat: lat,
                    lon: lon
                }
            }, "*" );

            this.contentWindow.postMessage( {
                type: "pwsData",
                payload: data
            }, "*" );

            if ( airports.length > 0 ) {
                airports = encodeURIComponent( JSON.stringify( airports ) );
                this.contentWindow.postMessage( {
                    type: "airportData",
                    payload: airports
                }, "*" );
            }
        } );

        popup.one( "popupafterclose", function() {
            if ( dataSent === false ) {
                callback( false );
            }
        } );

        openPopup( popup, {
            beforeposition: function() {
                popup.css( {
                    width: window.innerWidth - 36,
                    height: window.innerHeight - 28
                } );
            },
            x: 0,
            y: 0
        } );
    } ).fail( function() {
        callback( false );
    } );
}

function debugWU() {
    if ( typeof controller.settings.wtkey !== "string" || controller.settings.wtkey === "" ) {
        showerror( _( "An API key must be provided for Weather Underground" ) );
        return;
    }

    $.mobile.loading( "show" );

    $.ajax( {
        url: "https://api.wunderground.com/api/" + controller.settings.wtkey + "/yesterday/conditions/q/" + controller.settings.loc + ".json",
        dataType: isChromeApp ? "json" : "jsonp",
        shouldRetry: retryCount
    } ).done( function( data ) {
        $.mobile.loading( "hide" );

        if ( typeof data.response.error === "object" ) {
            showerror( _( "An invalid API key has been detected" ) );
            return;
        }

        if ( typeof data.history === "object" && typeof data.history.dailysummary ) {
            var summary = data.history.dailysummary[0],
                current = data.current_observation,
                country = current.display_location.country_iso3166,
                isMetric = ( ( country === "US" || country === "BM" || country === "PW" ) ? false : true ),
                popup = $( "<div data-role='popup' id='debugWU' class='ui-content' data-theme='a'>" +
                    "<table class='debugWU'>" +
                        "<tr><td>" + _( "Min Humidity" ) + "</td><td>" + summary.minhumidity + "%</td></tr>" +
                        "<tr><td>" + _( "Max Humidity" ) + "</td><td>" + summary.maxhumidity + "%</td></tr>" +
                        "<tr><td>" + _( "Mean Temp" ) + "</td><td>" + ( isMetric ? summary.meantempm + "&#176;C" : summary.meantempi + "&#176;F" ) + "</td></tr>" +
                        "<tr><td>" + _( "Precip Yesterday" ) + "</td><td>" + ( isMetric ? summary.precipm + "mm" : summary.precipi + "\"" ) + "</td></tr>" +
                        "<tr><td>" + _( "Precip Today" ) + "</td><td>" + ( isMetric ? current.precip_today_metric + "mm" : current.precip_today_in + "\"" ) + "</td></tr>" +
                        "<tr><td>" + _( "Adjustment Method" ) + "</td><td>" + getAdjustmentName( controller.options.uwt ) + "</td></tr>" +
                        "<tr><td>" + _( "Current % Watering" ) + "</td><td>" + controller.options.wl + "%</td></tr>" +
                        ( typeof controller.settings.lwc === "number" ? "<tr><td>" + _( "Last Weather Call" ) + "</td><td>" + dateToString( new Date( controller.settings.lwc * 1000 ) ) + "</td></tr>" : "" ) +
                        ( typeof controller.settings.lswc === "number" ? "<tr><td>" + _( "Last Successful Weather Call" ) + "</td><td>" + dateToString( new Date( controller.settings.lswc * 1000 ) ) + "</td></tr>" : "" ) +
                    "</table>" +
                "</div>" );

            openPopup( popup );
        } else {
            showerror( _( "Weather data cannot be found for your location" ) );
            return;
        }
    } ).fail( function() {
        $.mobile.loading( "hide" );
        showerror( _( "Connection timed-out. Please try again." ) );
    } );

    return false;
}

function showRainDelay() {
    $( ".ui-popup-active" ).find( "[data-role='popup']" ).popup( "close" );

	showDurationBox( {
	    title: _( "Change Rain Delay" ),
	    callback: raindelay,
	    label: _( "Duration" ),
	    maximum: 31536000,
	    granularity: 2,
	    preventCompression: true,
	    incrementalUpdate: false,
	    updateOnChange: false,
	    helptext:
			_( "Enable manual rain delay by entering a value into the input below. To turn off a currently enabled rain delay use a value of 0." )
	} );
}

function getAdjustmentName( id ) {
    return [ _( "Manual" ), "Zimmerman" ][ id & ~( 1 << 7 ) ];
}

function getAdjustmentMethod() {
    return controller.options.uwt & ~( 1 << 7 );
}

function getRestriction( id ) {
    return [ {
                isCurrent: 0,
                name: _( "None" )
            },
            {
                isCurrent: ( ( controller.options.uwt >> 7 ) & 1 ) ? true : false,
                name: _( "California Restriction" )
            } ][ id ];
}

function setRestriction( id, uwt ) {
    uwt = uwt || controller.options.uwt & ~( 1 << 7 );

    if ( id === 1 ) {
        uwt |= ( 1 << 7 );
    }

    return uwt;
}

function testAPIKey( key, callback ) {
    $.ajax( {
        url: "https://api.wunderground.com/api/" + key + "/conditions/forecast/lang:EN/q/75252.json",
        dataType: isChromeApp ? "json" : "jsonp",
        shouldRetry: retryCount
    } ).done( function( data ) {
        if ( typeof data.response.error === "object" && data.response.error.type === "keynotfound" ) {
            callback( false );
            return;
        }
        callback( true );
    } ).fail( function() {
        callback( false );
    } );
}

// Panel functions
function bindPanel() {
    var panel = $( "#sprinklers-settings" ),
        operation = function() {
            return ( controller && controller.settings && controller.settings.en && controller.settings.en === 1 ) ? _( "Disable" ) : _( "Enable" );
        };

    panel.enhanceWithin().panel().removeClass( "hidden" ).panel( "option", "classes.modal", "needsclick ui-panel-dismiss" );

    panel.find( "a[href='#site-control']" ).on( "click", function() {
        changePage( "#site-control" );
        return false;
    } );

    panel.find( "a[href='#about']" ).on( "click", function() {
        changePage( "#about" );
        return false;
    } );

    panel.find( ".cloud-login" ).on( "click", function() {
        requestCloudAuth();
        return false;
    } );

    panel.find( "a[href='#debugWU']" ).on( "click", debugWU );

    panel.find( "a[href='#localization']" ).on( "click", languageSelect );

    panel.find( ".export_config" ).on( "click", function() {
        getExportMethod();
        return false;
    } );

    panel.find( ".import_config" ).on( "click", function() {
        storage.get( "backup", function( newdata ) {
            getImportMethod( newdata.backup );
        } );

        return false;
    } );

    panel.find( ".toggleOperation" ).on( "click", function() {
        var self = $( this ),
            toValue = ( 1 - controller.settings.en );

        areYouSure( _( "Are you sure you want to" ) + " " + operation().toLowerCase() + " " + _( "operation?" ), "", function() {
            sendToOS( "/cv?pw=&en=" + toValue ).done( function() {
                $.when(
                    updateControllerSettings(),
                    updateControllerStatus()
                ).done( function() {
                    checkStatus();
                    self.find( "span:first" ).html( operation() ).attr( "data-translate", operation() );
                } );
            } );
        } );

        return false;
    } ).find( "span:first" ).html( operation() ).attr( "data-translate", operation() );

    panel.find( ".reboot-os" ).on( "click", function() {
        areYouSure( _( "Are you sure you want to reboot OpenSprinkler?" ), "", function() {
            $.mobile.loading( "show" );
            sendToOS( "/cv?pw=&rbt=1" ).done( function() {
                $.mobile.loading( "hide" );
                showerror( _( "OpenSprinkler is rebooting now" ) );
            } );
        } );
        return false;
    } );

    panel.find( ".show-providers" ).on( "click", function() {
        $( "#providers" ).popup( "destroy" ).remove();

        storage.get( [ "provider", "wapikey" ], function( data ) {
            data.provider = data.provider || "yahoo";

            var popup = $(
                "<div data-role='popup' id='providers' data-theme='a' data-overlay-theme='b'>" +
                    "<div class='ui-content'>" +
                        "<form>" +
                            "<label for='weather_provider'>" + _( "Weather Provider" ) +
                                "<select data-mini='true' id='weather_provider' class='needsclick'>" +
                                    "<option value='yahoo'>" + _( "Yahoo!" ) + "</option>" +
                                    "<option " + ( ( data.provider === "wunderground" ) ? "selected " : "" ) + "value='wunderground'>" + _( "Wunderground" ) + "</option>" +
                                "</select>" +
                            "</label>" +
                            "<label for='wapikey'>" + _( "Wunderground API Key" ) +
								"<input data-mini='true' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' " +
									"type='text' id='wapikey' value='" + ( ( data.wapikey ) ? data.wapikey : "" ) + "'>" +
							"</label>" +
                            "<input type='submit' value='" + _( "Submit" ) + "'>" +
                        "</form>" +
                    "</div>" +
                "</div>"
            );

            if ( data.provider === "yahoo" ) {
                popup.find( "#wapikey" ).closest( "label" ).hide();
            }

            popup.find( "form" ).on( "submit", function( e ) {
                e.preventDefault();

                var wapikey = $( "#wapikey" ).val(),
                    provider = $( "#weather_provider" ).val();

                if ( provider === "wunderground" && wapikey === "" ) {
                    showerror( _( "An API key must be provided for Weather Underground" ) );
                    return;
                }

                storage.set( {
                    "wapikey": wapikey,
                    "provider": provider
                } );

                updateWeather();

                $( "#providers" ).popup( "close" );

                return false;
            } );

            //Handle provider select change on weather settings
            popup.on( "change", "#weather_provider", function() {
                var val = $( this ).val();
                if ( val === "wunderground" ) {
                    $( "#wapikey" ).closest( "label" ).show();
                } else {
                    $( "#wapikey" ).closest( "label" ).hide();
                }
                popup.popup( "reposition", {
                    "positionTo": "window"
                } );
            } );

            popup.one( "popupafterclose", function() {
                document.activeElement.blur();
                this.remove();
            } ).popup().enhanceWithin().popup( "open" );
            return false;
        } );
    } );

    panel.find( ".changePassword > a" ).on( "click", changePassword );

    panel.find( "#downgradeui" ).on( "click", function() {
        areYouSure( _( "Are you sure you want to downgrade the UI?" ), "", function() {
            var url = "http://rayshobby.net/scripts/java/svc" + getOSVersion();

            sendToOS( "/cu?jsp=" + encodeURIComponent( url ) + "&pw=" ).done( function() {
                storage.remove( [ "sites", "current_site", "lang", "provider", "wapikey", "runonce" ] );
                location.reload();
            } );
        } );
        return false;
    } );

    panel.find( "#logout" ).on( "click", function() {
        logout();
        return false;
    } );

	openPanel = ( function() {
	    var panel = $( "#sprinklers-settings" ),
	        updateButtons = function() {
				var operation = ( controller && controller.settings && controller.settings.en && controller.settings.en === 1 ) ? _( "Disable" ) : _( "Enable" );
				panel.find( ".toggleOperation span:first" ).html( operation ).attr( "data-translate", operation );
	        };

	    $( "html" ).on( "datarefresh",  updateButtons );

	    function begin() {
			var currPage = $( ".ui-page-active" ).attr( "id" );

		    if ( currPage === "start" || currPage === "loadingPage" || !isControllerConnected() || $( ".ui-page-active" ).length !== 1 ) {
		        return;
		    }

		    updateButtons();
		    panel.panel( "open" );
	    }

	    return begin;
	} )();
}

// Device setting management functions
function showOptions( expandItem ) {
    var list = "",
        page = $( "<div data-role='page' id='os-options'>" +
            "<div class='ui-content' role='main'>" +
                "<div data-role='collapsibleset' id='os-options-list'>" +
                "</div>" +
                "<a class='submit preventBack' style='display:none'></a>" +
            "</div>" +
        "</div>" ),
        submitOptions = function() {
            var opt = {},
                invalid = false,
                isPi = isOSPi(),
                button = header.eq( 2 ),
                keyNames = { 1:"tz", 2:"ntp", 12:"htp", 13:"htp2", 14:"ar", 15:"nbrd", 16:"seq", 17:"sdt", 18:"mas", 19:"mton", 20:"mtoff",
					21:"urs", 22:"rst", 23:"wl", 25:"ipas", 30:"rlp", 36:"lg", 31:"uwt", 37:"mas2", 38:"mton2", 39:"mtof2" },
                key;

            button.prop( "disabled", true );
            page.find( ".submit" ).removeClass( "hasChanges" );

            page.find( "#os-options-list" ).find( ":input,button" ).filter( ":not(.noselect)" ).each( function() {
                var $item = $( this ),
                    id = $item.attr( "id" ),
                    data = $item.val(),
                    ip;

                if ( !id || ( !data && data !== "" ) ) {
                    return true;
                }

                switch ( id ) {
                    case "o1":
                        var tz = data.split( ":" );
                        tz[0] = parseInt( tz[0], 10 );
                        tz[1] = parseInt( tz[1], 10 );
                        tz[1] = ( tz[1] / 15 >> 0 ) / 4.0;tz[0] = tz[0] + ( tz[0] >= 0 ? tz[1] : -tz[1] );
                        data = ( ( tz[0] + 12 ) * 4 ) >> 0;
                        break;
                    case "datetime":
                        var dt = new Date( data * 1000 );

                        opt.tyy = dt.getUTCFullYear();
                        opt.tmm = dt.getUTCMonth();
                        opt.tdd = dt.getUTCDate();
                        opt.thh = dt.getUTCHours();
                        opt.tmi = dt.getUTCMinutes();
                        opt.ttt = Math.round( dt.getTime() / 1000 );

                        return true;
                    case "ip_addr":
                        ip = data.split( "." );

                        if ( ip === "0.0.0.0" ) {
                            showerror( _( "A valid IP address is required when DHCP is not used" ) );
                            invalid = true;
                            return false;
                        }

                        opt.o4 = ip[0];
                        opt.o5 = ip[1];
                        opt.o6 = ip[2];
                        opt.o7 = ip[3];

                        return true;
                    case "gateway":
                        ip = data.split( "." );

                        if ( ip === "0.0.0.0" ) {
                            showerror( _( "A valid gateway address is required when DHCP is not used" ) );
                            invalid = true;
                            return false;
                        }

                        opt.o8 = ip[0];
                        opt.o9 = ip[1];
                        opt.o10 = ip[2];
                        opt.o11 = ip[3];

                        return true;
                    case "ntp_addr":
                        ip = data.split( "." );

                        opt.o32 = ip[0];
                        opt.o33 = ip[1];
                        opt.o34 = ip[2];
                        opt.o35 = ip[3];

                        return true;
                    case "wto":
						if ( escapeJSON( controller.settings.wto ) === data ) {
							return true;
						}

						break;
                    case "o12":
                        if ( !isPi ) {
                            opt.o12 = data & 0xff;
                            opt.o13 = ( data >> 8 ) & 0xff;
                        }
                        return true;
                    case "o31":
                        if ( data > 0 && $( "#wtkey" ).val() === "" ) {
                            showerror( _( "Weather Underground API key is required for weather-based control" ) );
                            invalid = true;
                            return false;
                        }

                        var restrict = page.find( "#weatherRestriction" );
                        if ( restrict.length ) {
                            data = setRestriction( parseInt( restrict.val() ), data );
                        }
                        break;
                    case "o18":
                    case "o37":
                        if ( parseInt( data ) > ( parseInt( page.find( "#o15" ).val() ) + 1 ) * 8 ) {
                            data = 0;
                        }

                        break;
                    case "o2":
                    case "o14":
                    case "o16":
                    case "o21":
                    case "o22":
                    case "o25":
                    case "o30":
                    case "o36":
                    case "o3":
                        data = $item.is( ":checked" ) ? 1 : 0;
                        if ( !data ) {
                            return true;
                        }
                        break;
                }
                if ( isPi ) {
                    if ( id === "loc" || id === "lg" ) {
                        id = "o" + id;
                    } else {
                        key = /\d+/.exec( id );
                        id = "o" + keyNames[key];
                    }
                }

                // Because the firmware has a bug regarding spaces, let us replace them out now with a compatible seperator
                if ( checkOSVersion( 208 ) === true && id === "loc" ) {
                    data = data.replace( /\s/g, "_" );
                }

                opt[id] = data;
            } );
            if ( invalid ) {
                button.prop( "disabled", false );
                page.find( ".submit" ).addClass( "hasChanges" );
                return;
            }
            $.mobile.loading( "show" );
            sendToOS( "/co?pw=&" + $.param( opt ) ).done( function() {
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Settings have been saved" ) );
                } );
                goBack();
                updateController( updateWeather );
            } ).fail( function() {
                button.prop( "disabled", false );
                page.find( ".submit" ).addClass( "hasChanges" );
            } );
        },
        header = changeHeader( {
            title: _( "Edit Options" ),
            leftBtn: {
                icon: "carat-l",
                text: _( "Back" ),
                class: "ui-toolbar-back-btn",
                on: checkChangesBeforeBack
            },
            rightBtn: {
                icon: "check",
                text: _( "Submit" ),
                class: "submit",
                on: submitOptions
            }

        } ),
        timezones, tz, i;

    page.find( ".submit" ).on( "click", submitOptions );

    list = "<fieldset data-role='collapsible'" + ( typeof expandItem !== "string" || expandItem === "system" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "System" ) + "</legend>";

    if ( typeof controller.options.ntp !== "undefined" ) {
        list += "<div class='ui-field-contain datetime-input'><label for='datetime'>" + _( "Device Time" ) + "</label>" +
			"<button " + ( controller.options.ntp ? "disabled " : "" ) + "data-mini='true' id='datetime' " +
				"value='" + ( controller.settings.devt + ( new Date( controller.settings.devt * 1000 ).getTimezoneOffset() * 60 ) ) + "'>" +
			dateToString( new Date( controller.settings.devt * 1000 ) ).slice( 0, -3 ) + "</button></div>";
    }

    if ( !isOSPi() && typeof controller.options.tz !== "undefined" ) {
        timezones = [ "-12:00", "-11:30", "-11:00", "-10:00", "-09:30", "-09:00", "-08:30", "-08:00", "-07:00", "-06:00",
			"-05:00", "-04:30", "-04:00", "-03:30", "-03:00", "-02:30", "-02:00", "+00:00", "+01:00", "+02:00", "+03:00",
			"+03:30", "+04:00", "+04:30", "+05:00", "+05:30", "+05:45", "+06:00", "+06:30", "+07:00", "+08:00", "+08:45",
			"+09:00", "+09:30", "+10:00", "+10:30", "+11:00", "+11:30", "+12:00", "+12:45", "+13:00", "+13:45", "+14:00" ];

        tz = controller.options.tz - 48;
        tz = ( ( tz >= 0 ) ? "+" : "-" ) + pad( ( Math.abs( tz ) / 4 >> 0 ) ) + ":" + ( ( Math.abs( tz ) % 4 ) * 15 / 10 >> 0 ) + ( ( Math.abs( tz ) % 4 ) * 15 % 10 );
        list += "<div class='ui-field-contain'><label for='o1' class='select'>" + _( "Timezone" ) + "</label>" +
			"<select " + ( checkOSVersion( 210 ) ? "disabled='disabled' " : "" ) + "data-mini='true' id='o1'>";

        for ( i = 0; i < timezones.length; i++ ) {
            list += "<option " + ( ( timezones[i] === tz ) ? "selected" : "" ) + " value='" + timezones[i] + "'>" + timezones[i] + "</option>";
        }
        list += "</select></div>";
    }

    list += "<div class='ui-field-contain'>" +
        "<label for='loc'>" + _( "Location" ) +
			"<button data-helptext='" +
				_( "Location can be a zip code, city/state or a weatherunderground personal weather station using the format: pws:ID." ) +
				"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
		"</label>" +
        "<table>" +
            "<tr style='width:100%;vertical-align: top;'>" +
                "<td style='width:100%'>" +
					"<input data-wrapper-class='" + ( $( "#weather" ).is( ":empty" ) ? "" : "green " ) +
						"controlgroup-textinput ui-btn' data-mini='true' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' " +
						"type='text' id='loc' value='" + controller.settings.loc + "'>" +
				"</td>" +
                "<td " + ( checkOSVersion( 210 ) && controller.settings.wtkey !== "" && weatherKeyFail === false ? "" : "class='hidden' " ) + "id='nearbyPWS'>" +
					"<button class='noselect' data-icon='location' data-iconpos='notext' data-mini='true'></button>" +
				"</td>" +
                "<td " + ( checkOSVersion( 210 ) && controller.settings.wtkey !== "" && weatherKeyFail === false ? "class='hidden' " : "" ) + "id='lookup-loc'>" +
					"<button class='noselect' data-corners='false' data-mini='true'>" + _( "Lookup" ) + "</button>" +
				"</td>" +
            "</tr>" +
        "</table></div>";

    if ( typeof controller.options.lg !== "undefined" ) {
        list += "<label for='o36'><input data-mini='true' id='o36' type='checkbox' " + ( ( controller.options.lg === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Enable Logging" ) + "</label>";
    }

    list += "</fieldset><fieldset data-role='collapsible'" +
		( typeof expandItem === "string" && expandItem === "master" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "Configure Master" ) + "</legend>";

    if ( typeof controller.options.mas !== "undefined" ) {
        list += "<div class='ui-field-contain ui-field-no-border'><label for='o18' class='select'>" +
				_( "Master Station" ) + " " + ( typeof controller.options.mas2 !== "undefined" ? "1" : "" ) +
			"</label><select data-mini='true' id='o18'><option value='0'>" + _( "None" ) + "</option>";

        for ( i = 0; i < controller.stations.snames.length; i++ ) {
            list += "<option " + ( ( isStationMaster( i ) === 1 ) ? "selected" : "" ) + " value='" + ( i + 1 ) + "'>" +
				controller.stations.snames[i] + "</option>";

            if ( !checkOSVersion( 214 ) && i === 7 ) {
                break;
            }
        }
        list += "</select></div>";

        if ( typeof controller.options.mton !== "undefined" ) {
            list += "<div " + ( controller.options.mas === 0 ? "style='display:none' " : "" ) +
				"class='ui-field-no-border ui-field-contain duration-field'><label for='o19'>" +
					_( "Master On Delay" ) +
				"</label><button data-mini='true' id='o19' value='" + controller.options.mton + "'>" + controller.options.mton + "s</button></div>";
        }

        if ( typeof controller.options.mtof !== "undefined" ) {
            list += "<div " + ( controller.options.mas === 0 ? "style='display:none' " : "" ) +
				"class='ui-field-no-border ui-field-contain duration-field'><label for='o20'>" +
					_( "Master Off Delay" ) +
				"</label><button data-mini='true' id='o20' value='" + controller.options.mtof + "'>" + controller.options.mtof + "s</button></div>";
        }
    }

    if ( typeof controller.options.mas2 !== "undefined" ) {
        list += "<hr style='width:95%' class='content-divider'>";

        list += "<div class='ui-field-contain ui-field-no-border'><label for='o37' class='select'>" +
				_( "Master Station" ) + " 2" +
			"</label><select data-mini='true' id='o37'><option value='0'>" + _( "None" ) + "</option>";

        for ( i = 0; i < controller.stations.snames.length; i++ ) {
            list += "<option " + ( ( isStationMaster( i ) === 2 ) ? "selected" : "" ) + " value='" + ( i + 1 ) + "'>" + controller.stations.snames[i] +
				"</option>";

            if ( !checkOSVersion( 214 ) && i === 7 ) {
                break;
            }
        }

        list += "</select></div>";

        if ( typeof controller.options.mton2 !== "undefined" ) {
            list += "<div " + ( controller.options.mas2 === 0 ? "style='display:none' " : "" ) +
				"class='ui-field-no-border ui-field-contain duration-field'><label for='o38'>" +
					_( "Master On Delay" ) +
				"</label><button data-mini='true' id='o38' value='" + controller.options.mton2 + "'>" + controller.options.mton2 + "s</button></div>";
        }

        if ( typeof controller.options.mtof2 !== "undefined" ) {
            list += "<div " + ( controller.options.mas2 === 0 ? "style='display:none' " : "" ) +
				"class='ui-field-no-border ui-field-contain duration-field'><label for='o39'>" +
					_( "Master Off Delay" ) +
				"</label><button data-mini='true' id='o39' value='" + controller.options.mtof2 + "'>" + controller.options.mtof2 + "s</button></div>";
        }
    }

    list += "</fieldset><fieldset data-role='collapsible'" +
		( typeof expandItem === "string" && expandItem === "station" ? " data-collapsed='false'" : "" ) + "><legend>" +
		_( "Station Handling" ) + "</legend>";

    if ( typeof controller.options.ext !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o15' class='select'>" +
			_( "Number of Stations" ) +
			( typeof controller.options.dexp === "number" && controller.options.dexp < 255 && controller.options.dexp >= 0 ? " <span class='nobr'>(" +
				( controller.options.dexp * 8 + 8 ) + " " + _( "available" ) + ")</span>" : "" ) +
			"</label><select data-mini='true' id='o15'>";
        for ( i = 0; i < 6; i++ ) {
            list += "<option " + ( ( controller.options.ext === i ) ? "selected" : "" ) + " value='" + i + "'>" + ( i * 8 + 8 ) + " " + _( "stations" ) +
				"</option>";
        }
        list += "</select></div>";
    }

    if ( typeof controller.options.sdt !== "undefined" ) {
        list += "<div class='ui-field-contain duration-field'><label for='o17'>" + _( "Station Delay" ) + "</label>" +
			"<button data-mini='true' id='o17' value='" + controller.options.sdt + "'>" +
				dhms2str( sec2dhms( controller.options.sdt ) ) +
			"</button></div>";
    }

    if ( typeof controller.options.seq !== "undefined" ) {
        list += "<label for='o16'><input data-mini='true' id='o16' type='checkbox' " +
				( ( controller.options.seq === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Sequential" ) + "</label>";
    }

    list += "</fieldset><fieldset data-role='collapsible'" +
		( typeof expandItem === "string" && expandItem === "weather" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "Weather Control" ) + "</legend>";

    if ( typeof controller.settings.wtkey !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='wtkey'>" + _( "Wunderground Key" ).replace( "Wunderground", "Wunder&shy;ground" ) +
	        "<button data-helptext='" +
				_( "Weather Underground requires an API Key which can be obtained from " ) +
				"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
		"</label>" +
        "<table>" +
            "<tr style='width:100%;vertical-align: top;'>" +
                "<td style='width:100%'>" +
                    "<div class='" +
						( weatherKeyFail === true ? "red " : ( ( controller.settings.wtkey && controller.settings.wtkey !== "" ) ? "green " : "" ) ) +
						"ui-input-text controlgroup-textinput ui-btn ui-body-inherit ui-corner-all ui-mini ui-shadow-inset ui-input-has-clear'>" +
							"<input data-role='none' data-mini='true' autocomplete='off' autocorrect='off' autocapitalize='off' spellcheck='false' " +
								"type='text' id='wtkey' value='" + controller.settings.wtkey + "'>" +
							"<a href='#' tabindex='-1' aria-hidden='true' data-helptext='" + _( "An invalid API key has been detected." ) +
								"' class='" + ( weatherKeyFail === true ? "" : "hidden " ) +
								"help-icon ui-input-clear ui-btn ui-icon-alert ui-btn-icon-notext ui-corner-all'>" +
							"</a>" +
                    "</div>" +
                "</td>" +
                "<td><button class='noselect' data-mini='true' id='verify-api'>" + _( "Verify" ) + "</button></td>" +
            "</tr>" +
        "</table></div>";
    }

    if ( typeof controller.options.uwt !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o31' class='select'>" + _( "Weather Adjustment Method" ) +
				"<button data-helptext='" +
					_( "Weather adjustment uses Weather Underground data in conjunction with the selected method to adjust the watering percentage." ) +
					"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
			"</label><select " + ( controller.settings.wtkey && controller.settings.wtkey !== "" ? "" : "disabled='disabled' " ) +
				"data-mini='true' id='o31'>";
        for ( i = 0; i < 2; i++ ) {
            list += "<option " + ( ( i === getAdjustmentMethod() ) ? "selected" : "" ) + " value='" + i + "'>" + getAdjustmentName( i ) + "</option>";
        }
        list += "</select></div>";

        if ( typeof controller.settings.wto === "object" ) {
	        list += "<div class='ui-field-contain" + ( getAdjustmentMethod() === 0 ? " hidden" : "" ) + "'><label for='wto'>" + _( "Adjustment Method Options" ) + "</label>" +
				"<button data-mini='true' id='wto' value='" + escapeJSON( controller.settings.wto ) + "'>" +
					_( "Tap to Configure" ) +
				"</button></div>";
        }

        if ( checkOSVersion( 214 ) ) {
            list += "<div class='ui-field-contain'><label for='weatherRestriction' class='select'>" + _( "Weather-Based Restrictions" ) +
					"<button data-helptext='" + _( "Prevents watering when the selected restriction is met." ) +
						"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
				"</label>" +
				"<select " + ( controller.settings.wtkey && controller.settings.wtkey !== "" ? "" : "disabled='disabled' " ) +
					"data-mini='true' class='noselect' id='weatherRestriction'>";

            for ( i = 0; i < 2; i++ ) {
                var restrict = getRestriction( i );
                list += "<option " + ( restrict.isCurrent === true ? "selected" : "" ) + " value='" + i + "'>" + restrict.name + "</option>";
            }
            list += "</select></div>";
        }
    }

    if ( typeof controller.options.wl !== "undefined" ) {
        list += "<div class='ui-field-contain duration-field'><label for='o23'>" + _( "% Watering" ) +
				"<button data-helptext='" +
					_( "The watering percentage scales station run times by the set value. When weather adjustment is used the watering percentage is automatically adjusted." ) +
					"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
			"</label><button " + ( ( controller.options.uwt && controller.options.uwt > 0 ) ? "disabled='disabled' " : "" ) +
				"data-mini='true' id='o23' value='" + controller.options.wl + "'>" + controller.options.wl + "%</button></div>";
    }

    if ( typeof controller.options.urs !== "undefined" ) {
        list += "<label for='o21'>" +
			"<input data-mini='true' id='o21' type='checkbox' " + ( ( controller.options.urs === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Use Rain Sensor" ) + "</label>";
    }

    if ( typeof controller.options.rso !== "undefined" ) {
        list += "<label for='o22'><input " + ( controller.options.urs === 1 ? "" : "data-wrapper-class='hidden' " ) +
			"data-mini='true' id='o22' type='checkbox' " + ( ( controller.options.rso === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Normally Open (Rain Sensor)" ) + "</label>";
    }

    list += "</fieldset><fieldset class='full-width-slider' data-role='collapsible'" +
		( typeof expandItem === "string" && expandItem === "lcd" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "LCD Screen" ) + "</legend>";

    if ( typeof controller.options.con !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o27'>" + _( "Contrast" ) + "</label>" +
			"<input type='range' id='o27' min='0' max='255' step='10' data-highlight='true' value='" + ( controller.options.con ) + "'></div>";
    }

    if ( typeof controller.options.lit !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o28'>" + _( "Brightness" ) + "</label>" +
			"<input type='range' id='o28' min='0' max='255' step='10' data-highlight='true' value='" + ( controller.options.lit ) + "'></div>";
    }

    if ( typeof controller.options.dim !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o29'>" + _( "Idle Brightness" ) + "</label>" +
        "<input type='range' id='o29' min='0' max='255' step='10' data-highlight='true' value='" + ( controller.options.dim ) + "'></div>";
    }

    list += "</fieldset><fieldset data-role='collapsible' data-theme='b'" +
		( typeof expandItem === "string" && expandItem === "advanced" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "Advanced" ) + "</legend>";

    if ( typeof controller.options.hp0 !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o12'>" + _( "HTTP Port (restart required)" ) + "</label>" +
			"<input data-mini='true' type='number' pattern='[0-9]*' id='o12' value='" + ( controller.options.hp1 * 256 + controller.options.hp0 ) + "'>" +
			"</div>";
    }

    if ( typeof controller.options.devid !== "undefined" ) {
        list += "<div class='ui-field-contain'><label for='o26'>" + _( "Device ID (restart required)" ) +
			"<button data-helptext='" +
				_( "Device ID modifies the last byte of the MAC address." ) +
			"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button></label>" +
			"<input data-mini='true' type='number' pattern='[0-9]*' max='255' id='o26' value='" + controller.options.devid + "'></div>";
    }

    if ( typeof controller.options.rlp !== "undefined" ) {
        list += "<div class='ui-field-contain duration-field'>" +
			"<label for='o30'>" + _( "Relay Pulse" ) +
				"<button data-helptext='" +
					_( "Relay pulsing is used for special situations where rapid pulsing is needed in the output with a range from 1 to 2000 milliseconds. A zero value disables the pulsing option." ) +
					"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
			"</label><button data-mini='true' id='o30' value='" + controller.options.rlp + "'>" + controller.options.rlp + "ms</button></div>";
    } else if ( typeof controller.options.bst !== "undefined" ) {
        list += "<div class='ui-field-contain duration-field'>" +
			"<label for='o30'>" + _( "Boost Time" ) +
				"<button data-helptext='" +
					_( "Boost time changes how long the boost converter is activated with a range from 0 to 1000 milliseconds." ) +
					"' class='help-icon btn-no-border ui-btn ui-icon-info ui-btn-icon-notext'></button>" +
			"</label><button data-mini='true' id='o30' value='" + controller.options.bst + "'>" + controller.options.bst + "ms</button></div>";
    }

    if ( typeof controller.options.ntp !== "undefined" && checkOSVersion( 210 ) ) {
        var ntpIP = [ controller.options.ntp1, controller.options.ntp2, controller.options.ntp3, controller.options.ntp4 ].join( "." );
        list += "<div class='" + ( ( controller.options.ntp === 1 ) ? "" : "hidden " ) + "ui-field-contain duration-field'><label for='ntp_addr'>" +
			_( "NTP IP Address" ) + "</label><button data-mini='true' id='ntp_addr' value='" + ntpIP + "'>" + ntpIP + "</button></div>";
    }

    if ( typeof controller.options.dhcp !== "undefined" && checkOSVersion( 210 ) ) {
        var ip = [ controller.options.ip1, controller.options.ip2, controller.options.ip3, controller.options.ip4 ].join( "." ),
            gw = [ controller.options.gw1, controller.options.gw2, controller.options.gw3, controller.options.gw4 ].join( "." );

        list += "<div class='" + ( ( controller.options.dhcp === 1 ) ? "hidden " : "" ) + "ui-field-contain duration-field'><label for='ip_addr'>" +
			_( "IP Address" ) + "</label><button data-mini='true' id='ip_addr' value='" + ip + "'>" + ip + "</button></div>";
        list += "<div class='" + ( ( controller.options.dhcp === 1 ) ? "hidden " : "" ) + "ui-field-contain duration-field'><label for='gateway'>" +
			_( "Gateway Address" ) + "</label><button data-mini='true' id='gateway' value='" + gw + "'>" + gw + "</button></div>";
        list += "<label for='o3'><input data-mini='true' id='o3' type='checkbox' " + ( ( controller.options.dhcp === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Use DHCP (restart required)" ) + "</label>";
    }

    if ( typeof controller.options.ntp !== "undefined" ) {
        list += "<label for='o2'><input data-mini='true' id='o2' type='checkbox' " + ( ( controller.options.ntp === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "NTP Sync" ) + "</label>";
    }

    if ( typeof controller.options.ar !== "undefined" ) {
        list += "<label for='o14'><input data-mini='true' id='o14' type='checkbox' " + ( ( controller.options.ar === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Auto Reconnect" ) + "</label>";
    }

    if ( typeof controller.options.ipas !== "undefined" ) {
        list += "<label for='o25'><input data-mini='true' id='o25' type='checkbox' " + ( ( controller.options.ipas === 1 ) ? "checked='checked'" : "" ) + ">" +
			_( "Ignore Password" ) + "</label>";
    }

    list += "</fieldset><fieldset data-role='collapsible' data-theme='b'" +
		( typeof expandItem === "string" && expandItem === "reset" ? " data-collapsed='false'" : "" ) + ">" +
		"<legend>" + _( "Reset" ) + "</legend>";

    list += "<button data-mini='true' class='center-div reset-options'>" + _( "Reset All Options" ) + "</button>";
    list += "<button data-mini='true' class='center-div reset-stations'>" + _( "Reset All Station Data" ) + "</button>";

    list += "</fieldset>";

    // Insert options and remove unused groups
    page.find( "#os-options-list" )
        .html( list )
        .one( "change input", function() {
            header.eq( 2 ).prop( "disabled", false );
            page.find( ".submit" ).addClass( "hasChanges" );
        } )
        .find( "fieldset" ).each( function() {
            var group = $( this );

            if ( group.children().length === 1 ) {
                group.remove();
            }
        } );

    page.find( "#loc" ).on( "change input", function() {
        var loc = $( this );

        if ( loc.val() === "" ) {
            loc.parent().removeClass( "green" );
            page.find( "#o1" ).selectmenu( "enable" );
        }
    } );

    page.find( "#wto" ).on( "click", function() {
		showAdjustmentOptions( this, function() {
	        header.eq( 2 ).prop( "disabled", false );
            page.find( ".submit" ).addClass( "hasChanges" );
		} );
    } );

    page.find( ".reset-options" ).on( "click", function() {
        areYouSure( _( "Are you sure you want to delete all settings and return to the default settings?" ), "", function() {
            var co;

            if ( isOSPi() ) {
                co = "otz=32&ontp=1&onbrd=0&osdt=0&omas=0&omton=0&omtoff=0&orst=1&owl=100&orlp=0&ouwt=0&olg=1&oloc=Boston,MA";
            } else {
                co = "o1=32&o2=1&o3=1&o12=80&o13=0&o15=0&o17=0&o18=0&o19=0&o20=0&o22=1&o23=100&o26=0&o27=110&o28=100&o29=15&" +
					"o30=0&o31=0&o32=50&o33=97&o34=210&o35=169&o36=1&o37=0&038=0&o39=0&loc=Boston,MA";
            }

            sendToOS( "/co?pw=&" + co ).done( function() {
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Settings have been saved" ) );
                } );
                goBack();
                updateController( updateWeather );
            } );
        } );
    } );

    page.find( ".reset-stations" ).on( "click", function() {
        var cs = "";

        for ( var i = 0; i < controller.stations.snames.length; i++ ) {
            cs += "s" + i + "=S" + pad( i + 1 ) + "&";
        }

        if ( controller.options.mas ) {
            for ( i = 0; i < controller.settings.nbrd; i++ ) {
                cs += "m" + i + "=255&";
            }
        }

        if ( typeof controller.stations.ignore_rain === "object" ) {
            for ( i = 0; i < controller.settings.nbrd; i++ ) {
                cs += "i" + i + "=0&";
            }
        }

        if ( typeof controller.stations.act_relay === "object" ) {
            for ( i = 0; i < controller.settings.nbrd; i++ ) {
                cs += "a" + i + "=0&";
            }
        }

        if ( typeof controller.stations.stn_dis === "object" ) {
            for ( i = 0; i < controller.settings.nbrd; i++ ) {
                cs += "d" + i + "=0&";
            }
        }

        if ( typeof controller.stations.stn_seq === "object" ) {
            for ( i = 0; i < controller.settings.nbrd; i++ ) {
                cs += "q" + i + "=255&";
            }
        }

        areYouSure( _( "Are you sure you want to reset all stations?" ), _( "This will reset all station names and attributes" ), function() {
            $.mobile.loading( "show" );
            sendToOS( "/cs?pw=&" + cs ).done( function() {
                showerror( _( "Stations have been updated" ) );
                updateController();
            } );
        } );
    } );

    page.find( "#o3" ).on( "change", function() {
        var button = $( this ),
            checked = button.is( ":checked" ),
            manualInputs = page.find( "#ip_addr,#gateway" ).parents( ".ui-field-contain" );

        if ( checked ) {
            manualInputs.addClass( "hidden" );
        } else {
            manualInputs.removeClass( "hidden" );
        }
    } );

    page.find( "#o21" ).on( "change", function() {
        var button = $( this ),
            checked = button.is( ":checked" );

        if ( checked ) {
            page.find( "#o22" ).parent().removeClass( "hidden" );
        } else {
            page.find( "#o22" ).parent().addClass( "hidden" );
        }
    } );

    page.find( "#nearbyPWS > button" ).on( "click", function() {
        var loc = $( "#loc" ),
            button = $( this ),
            exit = function( result ) {
                clearTimeout( loadMsg );
                $.mobile.loading( "hide" );
                if ( result !== true ) {
                    nearbyPWS( -999, -999, finish );
                    return;
                }
                button.prop( "disabled", false );
            },
            loadMsg;

        if ( controller.settings.wtkey === "" ) {
            showerror( _( "An API key must be provided for Weather Underground" ) );
            exit();
        }

        $.mobile.loading( "show" );
        button.prop( "disabled", true );

        var finish = function( selected ) {
                if ( selected === false ) {
                    if ( page.find( "#loc" ).val() === "" ) {
                        page.find( "#o1" ).selectmenu( "enable" );
                    }
                } else {
                    if ( checkOSVersion( 210 ) ) {
                        page.find( "#o1" ).selectmenu( "disable" );
                    }
                    loc.parent().addClass( "green" );
                    loc.val( selected );
                    header.eq( 2 ).prop( "disabled", false );
                    page.find( ".submit" ).addClass( "hasChanges" );
                }
                exit( true );
            };

        try {
            loadMsg = setTimeout( function() {
                $.mobile.loading( "show", {
                    html: "<div class='logo'></div><h1 style='padding-top:5px'>" + _( "Attempting to retrieve your current location" ) + "</h1></p>",
                    textVisible: true,
                    theme: "b"
                } );
            }, 100 );
            navigator.geolocation.getCurrentPosition( function( position ) {
                clearTimeout( loadMsg );
                nearbyPWS( position.coords.latitude, position.coords.longitude, finish );
            }, exit );
        } catch ( err ) { exit(); }
    } );

    page.find( "#lookup-loc > button" ).on( "click", function() {
        var loc = page.find( "#loc" ),
            current = loc.val(),
            button = $( this );

        if ( /^pws:|^icao:/.test( current ) ) {
            showerror( _( "When using a personal weather station the location lookup is unavailable." ) );
            return;
        }

        button.prop( "disabled", true );

        resolveLocation( current, function( selected ) {
            if ( selected === false ) {
                if ( page.find( "#loc" ).val() === "" ) {
                    page.find( "#o1" ).selectmenu( "enable" );
                }
                showerror( _( "Unable to locate using:" ) + " " + current + ". " + _( "Please use another value and try again." ) );
            } else {
                if ( checkOSVersion( 210 ) ) {
                    page.find( "#o1" ).selectmenu( "disable" );
                }
                selected = selected.replace( /^[0-9]{5}\s-\s/, "" );
                loc.parent().addClass( "green" );
                loc.val( selected );
                header.eq( 2 ).prop( "disabled", false );
                page.find( ".submit" ).addClass( "hasChanges" );
            }
            button.prop( "disabled", false );
        } );
    } );

    page.find( "#verify-api" ).on( "click", function() {
        var key = page.find( "#wtkey" ),
            button = $( this );

        button.prop( "disabled", true );

        testAPIKey( key.val(), function( result ) {
            if ( result === true ) {
                key.parent().find( ".ui-icon-alert" ).hide();
                key.parent().removeClass( "red" ).addClass( "green" );
                if ( checkOSVersion( 210 ) ) {
                    page.find( "#lookup-loc" ).addClass( "hidden" );
                    page.find( "#nearbyPWS" ).removeClass( "hidden" );
                }
            } else {
                key.parent().find( ".ui-icon-alert" ).removeClass( "hidden" ).show();
                key.parent().removeClass( "green" ).addClass( "red" );
                if ( checkOSVersion( 210 ) ) {
                    page.find( "#lookup-loc" ).removeClass( "hidden" );
                    page.find( "#nearbyPWS" ).addClass( "hidden" );
                }
            }
            button.prop( "disabled", false );
        } );
    } );

    page.find( ".help-icon" ).on( "click", showHelpText );

    page.find( ".duration-field button:not(.help-icon)" ).on( "click", function() {
        var dur = $( this ),
            id = dur.attr( "id" ),
            name = page.find( "label[for='" + id + "']" ).text(),
            helptext = dur.parent().find( ".help-icon" ).data( "helptext" ),
            max = 240;

        header.eq( 2 ).prop( "disabled", false );
        page.find( ".submit" ).addClass( "hasChanges" );

        if ( id === "ip_addr" || id === "gateway" || id === "ntp_addr" ) {
            showIPRequest( {
                title: name,
                ip: dur.val().split( "." ),
                callback: function( ip ) {
                    dur.val( ip.join( "." ) ).text( ip.join( "." ) );
                }
            } );
        } else if ( id === "o19" || id === "o38" ) {
            showSingleDurationInput( {
                data: dur.val(),
                title: name,
                callback: function( result ) {
                    dur.val( result ).text( result + "s" );
                },
                label: _( "Seconds" ),
                maximum: 60,
                helptext: helptext
            } );
        } else if ( id === "o30" ) {
            showSingleDurationInput( {
                data: dur.val(),
                title: name,
                callback: function( result ) {
                    dur.val( result ).text( result + "ms" );
                },
                label: _( "Milliseconds" ),
                maximum: 2000,
                helptext: helptext
            } );
        } else if ( id === "o20" || id === "o39" ) {
            showSingleDurationInput( {
                data: dur.val(),
                title: name,
                callback: function( result ) {
                    dur.val( result ).text( result + "s" );
                },
                label: _( "Seconds" ),
                maximum: 60,
                minimum: -60,
                helptext: helptext
            } );
        } else if ( id === "o23" ) {
            showSingleDurationInput( {
                data: dur.val(),
                title: name,
                callback: function( result ) {
                    dur.val( result ).text( result + "%" );
                },
                label: _( "% Watering" ),
                maximum: 250,
                helptext: helptext
            } );
        } else if ( id === "o17" ) {
            var min = 0;

            if ( checkOSVersion( 210 ) ) {
                max = checkOSVersion( 214 ) ? 57600 : 64800;
            }

            if ( checkOSVersion( 211 ) ) {
                min = -3540;
                max = 3540;
            }

            showDurationBox( {
                seconds: dur.val(),
                title: name,
                callback: function( result ) {
                    dur.val( result );
                    dur.text( dhms2str( sec2dhms( result ) ) );
                },
                maximum: max,
                minimum: min
            } );
        }

        return false;
    } );

    page.find( "#o2" ).on( "change", function() {
        var ntp = $( this ).is( ":checked" );

        // Switch state of device time input based on NTP status
        page.find( ".datetime-input button" ).prop( "disabled", ntp );

        // Switch the NTP IP address field when NTP is used
        page.find( "#ntp_addr" ).parents( ".ui-field-contain" ).toggleClass( "hidden", !ntp );
    } );

    page.find( "#o18,#o37" ).on( "change", function() {
        page.find( "#o19,#o20" ).parents( ".ui-field-contain" ).toggle( parseInt( page.find( "#o18" ).val() ) === 0 ? false : true );
        if ( typeof controller.options.mas2 !== "undefined" ) {
            page.find( "#o38,#o39" ).parents( ".ui-field-contain" ).toggle( parseInt( page.find( "#o37" ).val() ) === 0 ? false : true );
        }
    } );

    page.find( "#o31" ).on( "change", function() {

        // Switch state of water level input based on weather algorithm status
        page.find( "#o23" ).prop( "disabled", ( parseInt( this.value ) === 0 || page.find( "#wtkey" ).val() === "" ? false : true ) );

        // Switch the state of adjustment options based on the selected method
        page.find( "#wto" ).parents( ".ui-field-contain" ).toggleClass( "hidden", parseInt( this.value ) === 0 ? true : false );
    } );

    page.find( "#wtkey" ).on( "change input", function() {

        // Hide the invalid key status after change
        page.find( "#wtkey" ).siblings( ".help-icon" ).hide();
        page.find( "#wtkey" ).parent().removeClass( "red green" );

        // Switch state of weather algorithm input based on API key status
        if ( this.value === "" ) {
	        page.find( "#wto" ).parents( ".ui-field-contain" ).toggleClass( "hidden", true );
            page.find( "#o31,#weatherRestriction" ).val( "0" ).selectmenu( "refresh" ).selectmenu( "disable" );
            page.find( "#o23" ).prop( "disabled", false );
        } else {
            page.find( "#o31,#weatherRestriction" ).selectmenu( "enable" );
        }
    } );

    page.find( ".datetime-input" ).on( "click", function() {
        var input = $( this ).find( "button" );

        if ( input.prop( "disabled" ) ) {
            return;
        }

        header.eq( 2 ).prop( "disabled", false );
        page.find( ".submit" ).addClass( "hasChanges" );

        // Show date time input popup
        showDateTimeInput( input.val(), function( data ) {
            input.text( dateToString( data ).slice( 0, -3 ) ).val( Math.round( data.getTime() / 1000 ) );
        } );
        return false;
    } );

    page.one( "pagehide", function() {
        page.remove();
    } );

    header.eq( 2 ).prop( "disabled", true );

    $( "#os-options" ).remove();
    $.mobile.pageContainer.append( page );
}

var showHomeMenu = ( function() {

	var page, id, showHidden, popup;

	function makeMenu() {
		page = $( ".ui-page-active" );
        id = page.attr( "id" );
        showHidden = page.hasClass( "show-hidden" );
        popup = $( "<div data-role='popup' data-theme='a' id='mainMenu'>" +
            "<ul data-role='listview' data-inset='true' data-corners='false'>" +
                "<li data-role='list-divider'>" + _( "Information" ) + "</li>" +
                "<li><a href='#preview' class='squeeze'>" + _( "Preview Programs" ) + "</a></li>" +
                ( checkOSVersion( 206 ) || checkOSPiVersion( "1.9" ) ? "<li><a href='#logs'>" + _( "View Logs" ) + "</a></li>" : "" ) +
                "<li data-role='list-divider'>" + _( "Programs and Settings" ) + "</li>" +
                "<li><a href='#raindelay'>" + _( "Change Rain Delay" ) + "</a></li>" +
                "<li><a href='#runonce'>" + _( "Run-Once Program" ) + "</a></li>" +
                "<li><a href='#programs'>" + _( "Edit Programs" ) + "</a></li>" +
                "<li><a href='#os-options'>" + _( "Edit Options" ) + "</a></li>" +
                ( checkOSVersion( 210 ) ? "" : "<li><a href='#manual'>" + _( "Manual Control" ) + "</a></li>" ) +
            ( id === "sprinklers" || id === "runonce" || id === "programs" || id === "manual" || id === "addprogram" ?
                "</ul>" +
                "<div class='ui-grid-a ui-mini tight'>" +
                    "<div class='ui-block-a'><a class='ui-btn tight' href='#show-hidden'>" +
						( showHidden ? _( "Hide" ) : _( "Show" ) ) + " " + _( "Disabled" ) +
					"</a></div>" +
                    "<div class='ui-block-b'><a class='ui-btn red tight' href='#stop-all'>" + _( "Stop All Stations" ) + "</a></div>" +
                "</div>"
                : "<li><a class='ui-btn red' href='#stop-all'>" + _( "Stop All Stations" ) + "</a></li></ul>" ) +
        "</div>" );
	}

	function begin( btn ) {
	    btn = btn instanceof $ ? btn : $( btn );

	    $( ".ui-popup-active" ).find( "[data-role='popup']" ).popup( "close" );

	    makeMenu();

	    popup.on( "click", "a", function() {
	        var clicked = $( this ),
	            href = clicked.attr( "href" );

	        popup.popup( "close" );

	        if ( href === "#stop-all" ) {
	            areYouSure( _( "Are you sure you want to stop all stations?" ), "", function() {
	                $.mobile.loading( "show" );
	                sendToOS( "/cv?pw=&rsn=1" ).done( function() {
	                    $.mobile.loading( "hide" );
	                    refreshStatus();
	                    showerror( _( "All stations have been stopped" ) );
	                } );
	            } );
	        } else if ( href === "#show-hidden" ) {
	            if ( showHidden ) {
	                $( ".station-hidden" ).hide();
	                page.removeClass( "show-hidden" );
	            } else {
	                $( ".station-hidden" ).show();
	                page.addClass( "show-hidden" );
	            }
	        } else if ( href === "#raindelay" ) {
				showRainDelay();
	        } else {
	            checkChanges( function() {
	                changePage( href );
	            } );
	        }

	        return false;
	    } );

	    $( "#mainMenu" ).remove();

	    popup.one( "popupafterclose", function() {
	        btn.show();
	    } );

	    openPopup( popup, { positionTo: btn } );

	    btn.hide();
	}

	return begin;
} )();

var showHome = ( function() {
    var page = $( "<div data-role='page' id='sprinklers'>" +
            "<div class='ui-panel-wrapper'>" +
                "<div class='ui-content' role='main'>" +
                    "<div class='ui-grid-a ui-body ui-corner-all info-card noweather'>" +
                        "<div class='ui-block-a'>" +
                            "<div id='weather' class='pointer'></div>" +
                        "</div>" +
                        "<div class='ui-block-b center home-info pointer'>" +
                            "<span class='sitename bold'></span>" +
                            "<div id='clock-s' class='nobr'></div>" +
                            _( "Water Level" ) + ": <span class='waterlevel'></span>%" +
                        "</div>" +
                    "</div>" +
                "</div>" +
            "</div>" +
        "</div>" ),
		addTimer = function( station, rem ) {
            timers["station-" + station] = {
                val: rem,
                station: station,
                update: function() {
                    page.find( "#countdown-" + station ).text( "(" + sec2hms( this.val ) + " " + _( "remaining" ) + ")" );
                },
                done: function() {
                    page.find( "#countdown-" + station ).parent( "p" ).empty().siblings( ".station-status" ).removeClass( "on" ).addClass( "off" );
                }
            };
        },
        addCard = function( i ) {
            var station = controller.stations.snames[i],
                isScheduled = controller.settings.ps[i][0] > 0,
                isRunning = controller.status[i] > 0,
                pname = isScheduled ? pidname( controller.settings.ps[i][0] ) : "",
                rem = controller.settings.ps[i][1];

            if ( controller.status[i] && rem > 0 ) {
                addTimer( i, rem );
            }

            // Group card settings visually
            cards += "<div data-station='" + i + "' class='ui-corner-all card" +
				( isStationDisabled( i ) ? " station-hidden' style='display:none" : "" ) + "'>";
            cards += "<div class='ui-body ui-body-a center'>";
            cards += "<p class='tight center inline-icon' id='station_" + i + "'>" + station + "</p>";

            cards += "<span class='btn-no-border ui-btn ui-btn-icon-notext ui-corner-all station-status " +
				( isRunning ? "on" : ( isScheduled ? "wait" : "off" ) ) + "'></span>";

            cards += "<span class='btn-no-border ui-btn " + ( ( isStationMaster( i ) ) ? "ui-icon-master" : "ui-icon-gear" ) +
				" ui-btn-icon-notext station-settings' data-station='" + i + "' id='attrib-" + i + "' " +
                ( hasMaster ? ( "data-um='" + ( ( controller.stations.masop[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                ( hasMaster2 ? ( "data-um2='" + ( ( controller.stations.masop2[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                ( hasIR ? ( "data-ir='" + ( ( controller.stations.ignore_rain[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                ( hasAR ? ( "data-ar='" + ( ( controller.stations.act_relay[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                ( hasSD ? ( "data-sd='" + ( ( controller.stations.stn_dis[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                ( hasSequential ? ( "data-us='" + ( ( controller.stations.stn_seq[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) + "' " ) : "" ) +
                "></span>";

            if ( !isStationMaster( i ) ) {
                if ( isScheduled || isRunning ) {

                    // Generate status line for station
                    cards += "<p class='rem center'>" + ( isRunning ? _( "Running" ) + " " + pname : _( "Scheduled" ) + " " +
						( controller.settings.ps[i][2] ? _( "for" ) + " " + dateToString( new Date( controller.settings.ps[i][2] * 1000 ) ) : pname ) );
                    if ( rem > 0 ) {

                        // Show the remaining time if it's greater than 0
                        cards += " <span id='countdown-" + i + "' class='nobr'>(" + sec2hms( rem ) + " " + _( "remaining" ) + ")</span>";
                    }
                    cards += "</p>";
                }
            }

            // Close current card group
            cards += "</div></div>";
        },
        showAttributes = function() {
            $( "#stn_attrib" ).popup( "destroy" ).remove();

            var button = $( this ),
                id = button.data( "station" ),
                name = button.siblings( "[id='station_" + id + "']" ),
                saveChanges = function() {
                    button.data( "um", select.find( "#um" ).is( ":checked" ) ? 1 : 0 );
                    button.data( "um2", select.find( "#um2" ).is( ":checked" ) ? 1 : 0 );
                    button.data( "ir", select.find( "#ir" ).is( ":checked" ) ? 1 : 0 );
                    button.data( "ar", select.find( "#ar" ).is( ":checked" ) ? 1 : 0 );
                    button.data( "sd", select.find( "#sd" ).is( ":checked" ) ? 1 : 0 );
                    button.data( "us", select.find( "#us" ).is( ":checked" ) ? 1 : 0 );
                    name.html( select.find( "#stn-name" ).val() );
                    select.popup( "destroy" ).remove();
                },
                select = "<div data-overlay-theme='b' data-role='popup' data-theme='a' id='stn_attrib'>" +
					"<fieldset style='margin:0' data-corners='false' data-role='controlgroup'><form>";

            if ( typeof id !== "number" ) {
                return false;
            }

            select += "<div class='ui-bar-a ui-bar'>" + _( "Station Name" ) + ":</div>" +
				"<input class='bold center' data-corners='false' data-wrapper-class='tight stn-name ui-btn' id='stn-name' type='text' value='" +
					name.text() + "'>";

            if ( !isStationMaster( id ) ) {
                if ( hasMaster ) {
                    select += "<label for='um'><input class='needsclick' data-iconpos='right' id='um' type='checkbox' " +
							( ( button.data( "um" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Use Master" ) + " " + ( hasMaster2 ? "1" : "" ) +
						"</label>";
                }

                if ( hasMaster2 ) {
                    select += "<label for='um2'><input class='needsclick' data-iconpos='right' id='um2' type='checkbox' " +
							( ( button.data( "um2" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Use Master" ) + " 2" +
						"</label>";
                }

                if ( hasIR ) {
                    select += "<label for='ir'><input class='needsclick' data-iconpos='right' id='ir' type='checkbox' " +
							( ( button.data( "ir" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Ignore Rain" ) +
						"</label>";
                }

                if ( hasAR ) {
                    select += "<label for='ar'><input class='needsclick' data-iconpos='right' id='ar' type='checkbox' " +
							( ( button.data( "ar" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Activate Relay" ) +
						"</label>";
                }

                if ( hasSD ) {
                    select += "<label for='sd'><input class='needsclick' data-iconpos='right' id='sd' type='checkbox' " +
							( ( button.data( "sd" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Disable" ) +
						"</label>";
                }

                if ( hasSequential ) {
                    select += "<label for='us'><input class='needsclick' data-iconpos='right' id='us' type='checkbox' " +
							( ( button.data( "us" ) === 1 ) ? "checked='checked'" : "" ) + ">" + _( "Sequential" ) +
						"</label>";
                }
            }

            select += "<input data-wrapper-class='attrib-submit' data-theme='b' type='submit' value='" + _( "Submit" ) + "' /></form></fieldset></div>";
            select = $( select );
            select.on( "submit", "form", function() {
                saveChanges();
                submitStations();

                return false;
            } );
            select.one( "popupafteropen", function() {
                select.find( "#stn-name" ).focusInput();
            } ).enhanceWithin();

            $.mobile.pageContainer.append( select );

            var opts = { history: false };

            if ( isiOS ) {
				var pageTop = getPageTop();

				opts.x = pageTop.x;
				opts.y = pageTop.y;
            } else {
				opts.positionTo = "window";
            }

            select.popup( opts ).popup( "open" );
        },
        submitStations = function() {
            var is208 = ( checkOSVersion( 208 ) === true ),
                master = {},
                master2 = {},
                sequential = {},
                rain = {},
                relay = {},
                disable = {},
                names = {},
                attrib, bid, sid, s;

            for ( bid = 0; bid < controller.settings.nbrd; bid++ ) {
                if ( hasMaster ) {
                    master["m" + bid] = 0;
                }
                if ( hasMaster2 ) {
                    master2["n" + bid] = 0;
                }
                if ( hasSequential ) {
                    sequential["q" + bid] = 0;
                }
                if ( hasIR ) {
                    rain["i" + bid] = 0;
                }
                if ( hasAR ) {
                    relay["a" + bid] = 0;
                }
                if ( hasSD ) {
                    disable["d" + bid] = 0;
                }

                for ( s = 0; s < 8; s++ ) {
                    sid = bid * 8 + s;
                    attrib = page.find( "#attrib-" + sid );

                    if ( hasMaster ) {
                        master["m" + bid] = ( master["m" + bid] ) + ( attrib.data( "um" ) << s );
                    }
                    if ( hasMaster2 ) {
                        master2["n" + bid] = ( master2["n" + bid] ) + ( attrib.data( "um2" ) << s );
                    }
                    if ( hasSequential ) {
                        sequential["q" + bid] = ( sequential["q" + bid] ) + ( attrib.data( "us" ) << s );
                    }
                    if ( hasIR ) {
                        rain["i" + bid] = ( rain["i" + bid] ) + ( attrib.data( "ir" ) << s );
                    }
                    if ( hasAR ) {
                        relay["a" + bid] = ( relay["a" + bid] ) + ( attrib.data( "ar" ) << s );
                    }
                    if ( hasSD ) {
                        disable["d" + bid] = ( disable["d" + bid] ) + ( attrib.data( "sd" ) << s );
                    }

                    // Because the firmware has a bug regarding spaces, let us replace them out now with a compatible seperator
                    if ( is208 ) {
                        names["s" + sid] = page.find( "#station_" + sid ).text().replace( /\s/g, "_" );
                    } else {
                        names["s" + sid] = page.find( "#station_" + sid ).text();
                    }
                }
            }

            $.mobile.loading( "show" );
            sendToOS( "/cs?pw=&" + $.param( names ) +
				( hasMaster ? "&" + $.param( master ) : "" ) +
				( hasMaster2 ? "&" + $.param( master2 ) : "" ) +
				( hasSequential ? "&" + $.param( sequential ) : "" ) +
				( hasIR ? "&" + $.param( rain ) : "" ) +
				( hasAR ? "&" + $.param( relay ) : "" ) +
				( hasSD ? "&" + $.param( disable ) : "" )
			).done( function() {
                showerror( _( "Stations have been updated" ) );
                updateController( function() {
                    $( "html" ).trigger( "datarefresh" );
                } );
            } );
        },
        updateClock = function() {

            // Update the current time
            timers.clock = {
                val: controller.settings.devt,
                update: function() {
                    page.find( "#clock-s" ).text( dateToString( new Date( this.val * 1000 ), null, true ) );
                }
            };
        },
        reorderCards = function() {
            var cardHolder = page.find( "#os-stations-list" ),
                runningCards = page.find( "#os-running-stations" ),
                divider = page.find( ".content-divider" ),
                compare = function( a, b ) {
                    a = $( a ).data( "station" );
                    b = $( b ).data( "station" );
                    if ( a < b ) {
                        return -1;
                    }
                    if ( a > b ) {
                        return 1;
                    }
                    return 0;
                };

            // Move running stations up
            cardHolder.find( ".station-status.on" ).parents( ".card" ).appendTo( runningCards );

            // Move stopped stations down
            runningCards.find( ".station-status.off" ).parents( ".card" ).appendTo( cardHolder );

            // Sort stations
            cardHolder.children().sort( compare ).detach().appendTo( cardHolder );
            runningCards.children().sort( compare ).detach().appendTo( runningCards );

            // Hide divider if running group is empty
            if ( runningCards.children().length === 0 ) {
                divider.hide();
            } else {
                divider.show();
            }
        },
        updateContent = function() {
            var cardHolder = page.find( "#os-stations-list" ),
                allCards = cardHolder.children(),
                runningCards = page.find( "#os-running-stations" ).children(),
                isScheduled, isRunning, pname, rem, card, line;

            if ( !page.hasClass( "ui-page-active" ) ) {
				return;
            }

            updateClock();

            if ( allCards.length > controller.stations.snames.length ) {
                allCards.slice( controller.stations.snames.length, allCards.length ).remove();
            }

            page.find( ".waterlevel" ).text( controller.options.wl );
            page.find( ".sitename" ).text( siteSelect.val() );

            hasMaster = controller.options.mas ? true : false;
            hasMaster2 = controller.options.mas2 ? true : false;
            hasIR = ( typeof controller.stations.ignore_rain === "object" ) ? true : false;
            hasAR = ( typeof controller.stations.act_relay === "object" ) ? true : false;
            hasSD = ( typeof controller.stations.stn_dis === "object" ) ? true : false;
            hasSequential = ( typeof controller.stations.stn_seq === "object" ) ? true : false;

            for ( var i = 0; i < controller.stations.snames.length; i++ ) {
                isScheduled = controller.settings.ps[i][0] > 0;
                isRunning = controller.status[i] > 0;
                pname = isScheduled ? pidname( controller.settings.ps[i][0] ) : "";
                rem = controller.settings.ps[i][1];

                card = allCards.filter( "[data-station='" + i + "']" );

                if ( card.length === 0 ) {
                    card = runningCards.filter( "[data-station='" + i + "']" );
                }

                if ( card.length === 0 ) {
                    cards = "";
                    addCard( i );
                    cardHolder.append( cards );
                } else {
                    if ( isStationDisabled( i ) ) {
                        if ( !page.hasClass( "show-hidden" ) ) {
                            card.hide();
                        }
                        card.addClass( "station-hidden" );
                    } else {
                        card.show().removeClass( "station-hidden" );
                    }

                    card.find( "#station_" + i ).text( controller.stations.snames[i] );
                    card.find( ".station-status" ).removeClass( "on off wait" ).addClass( isRunning ? "on" : ( isScheduled ? "wait" : "off" ) );
                    if ( isStationMaster( i ) ) {
                        card.find( ".station-settings" ).removeClass( "ui-icon-gear" ).addClass( "ui-icon-master" );
                    } else {
                        card.find( ".station-settings" ).removeClass( "ui-icon-master" ).addClass( "ui-icon-gear" );
                    }
                    card.find( ".station-settings" ).data( {
                        um: hasMaster ? ( ( controller.stations.masop[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined,
                        um2: hasMaster2 ? ( ( controller.stations.masop2[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined,
                        ir: hasIR ? ( ( controller.stations.ignore_rain[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined,
                        ar: hasAR ? ( ( controller.stations.act_relay[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined,
                        sd: hasSD ? ( ( controller.stations.stn_dis[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined,
                        us: hasSequential ? ( ( controller.stations.stn_seq[parseInt( i / 8 )] & ( 1 << ( i % 8 ) ) ) ? 1 : 0 ) : undefined
                    } );

                    if ( !isStationMaster( i ) && ( isScheduled || isRunning ) ) {
                        line = ( isRunning ? _( "Running" ) + " " + pname : _( "Scheduled" ) + " " +
							( controller.settings.ps[i][2] ? _( "for" ) + " " + dateToString( new Date( controller.settings.ps[i][2] * 1000 ) ) : pname ) );
                        if ( rem > 0 ) {

                            // Show the remaining time if it's greater than 0
                            line += " <span id='countdown-" + i + "' class='nobr'>(" + sec2hms( rem ) + " " + _( "remaining" ) + ")</span>";
                            if ( controller.status[i] ) {
                                addTimer( i, rem );
                            }
                        }
                        if ( card.find( ".rem" ).length === 0 ) {
                            card.find( ".ui-body" ).append( "<p class='rem center'>" + line + "</p>" );
                        } else {
                            card.find( ".rem" ).html( line );
                        }
                    } else {
                        card.find( ".rem" ).remove();
                    }

                }
            }

            reorderCards();
        },
	    hasMaster, hasMaster2, hasIR, hasAR, hasSD, hasSequential, cards, siteSelect, i;

	page.one( "pageshow", function() {
		$( "html" ).on( "datarefresh", updateContent );
	} );

	function begin( firstLoad ) {
	    if ( !isControllerConnected() ) {
	        return false;
	    }

        hasMaster = controller.options.mas ? true : false;
        hasMaster2 = controller.options.mas2 ? true : false;
        hasIR = ( typeof controller.stations.ignore_rain === "object" ) ? true : false;
        hasAR = ( typeof controller.stations.act_relay === "object" ) ? true : false;
        hasSD = ( typeof controller.stations.stn_dis === "object" ) ? true : false;
        hasSequential = ( typeof controller.stations.stn_seq === "object" ) ? true : false;

		cards = "";
        siteSelect = $( "#site-selector" );

		page.find( ".sitename" ).toggleClass( "hidden", currLocal ? true : false ).text( siteSelect.val() );
		page.find( ".waterlevel" ).text( controller.options.wl );

	    updateClock();

	    for ( i = 0; i < controller.stations.snames.length; i++ ) {
	        addCard( i );
	    }

	    page.find( ".ui-content" ).append( "<div id='os-running-stations'></div><hr style='display:none' class='content-divider'>" +
			"<div id='os-stations-list' class='card-group center'>" + cards + "</div>" );
	    reorderCards();
	    page.on( "click", ".station-settings", showAttributes );
	    page.on( "click", ".home-info", function() {
	        changePage( "#os-options", {
	            expandItem: "weather"
	        } );
	        return false;
	    } );

	    page.on( "click", ".card", function() {

	        // Bind delegate handler to stop specific station (supported on firmware 2.1.0+ on Arduino)
	        if ( !checkOSVersion( 210 ) ) {
	            return false;
	        }

	        var el = $( this ),
	            station = el.data( "station" ),
	            currentStatus = controller.status[station],
	            name = controller.stations.snames[station],
	            question;

	        if ( isStationMaster( station ) ) {
	            return false;
	        }

	        if ( currentStatus ) {
	            question = _( "Do you want to stop the selected station?" );
	        } else {
	            if ( el.find( "span.nobr" ).length ) {
	                question = _( "Do you want to unschedule the selected station?" );
	            } else {
	                showDurationBox( {
	                    title: name,
	                    incrementalUpdate: false,
	                    maximum: 65535,
	                    helptext: _( "Enter a duration to manually run " + name ),
	                    callback: function( duration ) {
	                        sendToOS( "/cm?sid=" + station + "&en=1&t=" + duration + "&pw=", "json" ).done( function() {

	                            // Update local state until next device refresh occurs
	                            controller.settings.ps[station][0] = 99;
	                            controller.settings.ps[station][1] = duration;

	                            refreshStatus();
	                            showerror( _( "Station has been queued" ) );
	                        } );
	                    }
	                } );
	                return;
	            }
	        }
	        areYouSure( question, controller.stations.snames[station], function() {
	            sendToOS( "/cm?sid=" + station + "&en=0&pw=" ).done( function() {

	                // Update local state until next device refresh occurs
	                controller.settings.ps[station][0] = 0;
	                controller.settings.ps[station][1] = 0;
	                controller.status[i] = 0;

	                refreshStatus();
	                showerror( _( "Station has been stopped" ) );
	            } );
	        } );
	    } );

	    page.on( {
	        pagebeforeshow: function() {
	            var header = changeHeader( {
	                class: "logo",
	                leftBtn: {
	                    icon: "bullets",
	                    on: function() {
	                        openPanel();
	                        return false;
	                    }
	                },
	                rightBtn: {
	                    icon: "bell",
	                    class: "notifications",
	                    text: "<span class='notificationCount ui-li-count ui-btn-corner-all'>" + notifications.length + "</span>",
	                    on: function() {
	                        showNotifications();
	                        return false;
	                    }
	                },
	                animate: ( firstLoad ? false : true )
	            } );

	            if ( notifications.length === 0 ) {
	                $( header[2] ).hide();
	            }
	        }
	    } );

	    $( "#sprinklers" ).remove();
	    $.mobile.pageContainer.append( page );

	    if ( !$.isEmptyObject( weather ) ) {
	        updateWeatherBox();
	    }
	}

	return begin;
} )();

var showStart = ( function() {
	var page = $( "<div data-role='page' id='start'>" +
		    "<ul data-role='none' id='welcome_list' class='ui-listview ui-listview-inset ui-corner-all'>" +
		        "<li><div class='logo' id='welcome_logo'></div></li>" +
		        "<li class='ui-li-static ui-body-inherit ui-first-child ui-last-child ui-li-separate'>" +
		            "<p class='rain-desc'>" +
		                _( "Welcome to the OpenSprinkler application. This app only works with the OpenSprinkler controller which must be installed and setup on your home network." ) +
		            "</p>" +
		            "<a class='iab iabNoScale ui-btn ui-mini center' target='_blank' href='https://opensprinkler.com/product/opensprinkler/'>" +
		                _( "Purchase OpenSprinkler" ) +
		            "</a>" +
		        "</li>" +
		        "<li class='ui-first-child ui-last-child'>" +
		            "<a href='#' class='ui-btn center cloud-login'>" + _( "OpenSprinkler.com Login" ) + "</a>" +
		        "</li>" +
		        "<hr class='content-divider'>" +
		        "<li id='auto-scan' class='ui-first-child'>" +
		            "<a href='#' class='ui-btn ui-btn-icon-right ui-icon-carat-r'>" +
		                _( "Scan For Device" ) +
		            "</a>" +
		        "</li>" +
		        "<li class='ui-first-child ui-last-child'>" +
		            "<a class='ui-btn ui-btn-icon-right ui-icon-carat-r' data-rel='popup' href='#addnew'>" +
		                 _( "Add Controller" ) +
		            "</a>" +
		        "</li>" +
		    "</ul>" +
		"</div>" ),
		checkAutoScan = function() {
			updateDeviceIP( function( ip ) {
		        if ( ip === undefined ) {
		            resetStartMenu();
		            return;
		        }

		        // Check if the IP is on a private network, if not don't enable automatic scanning
		        if ( !isLocalIP( ip ) ) {
		            resetStartMenu();
		            return;
		        }

		        //Change main menu items to reflect ability to automatically scan
		        next.removeClass( "ui-first-child" ).find( "a.ui-btn" ).text( _( "Manually Add Device" ) );
		        auto.show();
			} );
		},
		resetStartMenu = function() {
		    next.addClass( "ui-first-child" ).find( "a.ui-btn" ).text( _( "Add Controller" ) );
		    auto.hide();
		},
		auto = page.find( "#auto-scan" ),
		next = auto.next();

    page.find( "#auto-scan" ).find( "a" ).on( "click", function() {
        startScan();
        return false;
    } );

    page.find( "a[href='#addnew']" ).on( "click", function() {
		showAddNew();
    } );

    page.find( ".cloud-login" ).on( "click", function() {
        requestCloudAuth();
        return false;
    } );

    page.on( "pagehide", function() {
        page.detach();
    } );

	function begin() {
		if ( isControllerConnected() ) {
			return false;
		}

	    $( "#start" ).remove();

	    $.mobile.pageContainer.append( page );

		checkAutoScan();
	}

	return begin;
} )();

function showGuidedSetup() {

	// Stub for guided setup page

}

function isStationMaster( sid ) {
    var m1 = typeof controller.options.mas === "number" ? controller.options.mas : 0,
        m2 = typeof controller.options.mas2 === "number" ? controller.options.mas2 : 0;

    sid++;

    if ( m1 === sid ) {
        return 1;
    } else if ( m2 === sid ) {
        return 2;
    } else {
        return 0;
    }
}

function isStationDisabled( sid ) {
    return ( typeof controller.stations.stn_dis === "object" && ( controller.stations.stn_dis[parseInt( sid / 8 )] & ( 1 << ( sid % 8 ) ) ) > 0 );
}

function isStationSequential( sid ) {
    if ( typeof controller.stations.stn_seq === "object" ) {
        return ( controller.stations.stn_seq[parseInt( sid / 8 )] & ( 1 << ( sid % 8 ) ) ) > 0;
    } else {
        return controller.options.seq;
    }
}

// Current status related functions
function refreshStatus() {
	if ( !isControllerConnected() ) {
		return;
	}

    $.when(
        updateControllerStatus(),
        updateControllerSettings(),
        updateControllerOptions()
    ).then( function() {

        // Notify the page container that the data has refreshed
        $( "html" ).trigger( "datarefresh" );
        checkStatus();
        return;
    }, networkFail );
}

function refreshData() {
	if ( !isControllerConnected() ) {
		return;
	}

    $.when(
        updateControllerPrograms(),
        updateControllerStations()
    ).fail( networkFail );
}

// Actually change the status bar
function changeStatus( seconds, color, line, onclick ) {
    var footer = $( "#footer-running" );

    onclick = onclick || function() {};

    if ( seconds > 1 ) {
        timers.statusbar = {
            val: seconds,
            type: "statusbar",
            update: function() {
                $( "#countdown" ).text( "(" + sec2hms( this.val ) + " " + _( "remaining" ) + ")" );
            }
        };
    }

    footer.removeClass().addClass( color ).html( line ).off( "click" ).on( "click", onclick );
}

// Update status bar based on device status
function checkStatus() {
    var open, ptotal, sample, pid, pname, line, match, tmp, i;

    if ( !isControllerConnected() ) {
        changeStatus( 0, "transparent", "<p class='running-text smaller'></p>" );
        return;
    }

    // Handle operation disabled
    if ( !controller.settings.en ) {
        changeStatus( 0, "red", "<p class='running-text center pointer'>" + _( "System Disabled" ) + "</p>", function() {
            areYouSure( _( "Do you want to re-enable system operation?" ), "", function() {
                showLoading( "#footer-running" );
                sendToOS( "/cv?pw=&en=1" ).done( function() {
                    updateController();
                } );
            } );
        } );
        return;
    }

    // Handle open stations
    open = {};
    for ( i = 0; i < controller.status.length; i++ ) {
        if ( controller.status[i] && !isStationMaster( i ) ) {
            open[i] = controller.status[i];
        }
    }

    // Handle more than 1 open station
    if ( Object.keys( open ).length >= 2 ) {
        ptotal = 0;

        for ( i in open ) {
            if ( open.hasOwnProperty( i ) ) {
                tmp = controller.settings.ps[i][1];
                if ( tmp > ptotal ) {
                    ptotal = tmp;
                }
            }
        }

        sample = Object.keys( open )[0];
        pid    = controller.settings.ps[sample][0];
        pname  = pidname( pid );
        line   = "<div><div class='running-icon'></div><div class='running-text pointer'>";

        line += pname + " " + _( "is running on" ) + " " + Object.keys( open ).length + " " + _( "stations" ) + " ";
        if ( ptotal > 0 ) {
            line += "<span id='countdown' class='nobr'>(" + sec2hms( ptotal ) + " " + _( "remaining" ) + ")</span>";
        }
        line += "</div></div>";
        changeStatus( ptotal, "green", line, goHome );
        return;
    }

    // Handle a single station open
    match = false;
    for ( i = 0; i < controller.stations.snames.length; i++ ) {
        if ( controller.settings.ps[i] && controller.settings.ps[i][0] && controller.status[i] && !isStationMaster( i ) ) {
            match = true;
            pid = controller.settings.ps[i][0];
            pname = pidname( pid );
            line = "<div><div class='running-icon'></div><div class='running-text pointer'>";
            line += pname + " " + _( "is running on station" ) + " <span class='nobr'>" + controller.stations.snames[i] + "</span> ";
            if ( controller.settings.ps[i][1] > 0 ) {
                line += "<span id='countdown' class='nobr'>(" + sec2hms( controller.settings.ps[i][1] ) + " " + _( "remaining" ) + ")</span>";
            }
            line += "</div></div>";
            break;
        }
    }

    if ( match ) {
        changeStatus( controller.settings.ps[i][1], "green", line, goHome );
        return;
    }

    // Handle rain delay enabled
    if ( controller.settings.rd ) {
        changeStatus( 0, "red", "<p class='running-text center pointer'>" +
			_( "Rain delay until" ) + " " + dateToString( new Date( controller.settings.rdst * 1000 ) ) + "</p>",
			function() {
	            areYouSure( _( "Do you want to turn off rain delay?" ), "", function() {
	                showLoading( "#footer-running" );
	                sendToOS( "/cv?pw=&rd=0" ).done( function() {
	                    updateController();
	                } );
				} );
			}
        );
        return;
    }

    // Handle rain sensor triggered
    if ( controller.options.urs === 1 && controller.settings.rs === 1 ) {
        changeStatus( 0, "red", "<p class='running-text center'>" + _( "Rain detected" ) + "</p>" );
        return;
    }

    // Handle manual mode enabled
    if ( controller.settings.mm === 1 ) {
        changeStatus( 0, "red", "<p class='running-text center pointer'>" + _( "Manual mode enabled" ) + "</p>", function() {
            areYouSure( _( "Do you want to turn off manual mode?" ), "", function() {
                showLoading( "#footer-running" );
                sendToOS( "/cv?pw=&mm=0" ).done( function() {
                    updateController();
                } );
            } );
        } );
        return;
    }

    var lrdur = controller.settings.lrun[2];

    // If last run duration is given, add it to the footer
    if ( lrdur !== 0 ) {
        var lrpid = controller.settings.lrun[1];
        pname = pidname( lrpid );

        changeStatus( 0, "transparent", "<p class='running-text smaller center pointer'>" + pname + " " + _( "last ran station" ) + " " +
			controller.stations.snames[controller.settings.lrun[0]] + " " + _( "for" ) + " " + ( lrdur / 60 >> 0 ) + "m " + ( lrdur % 60 ) + "s " +
			_( "on" ) + " " + dateToString( new Date( controller.settings.lrun[3] * 1000 ) ) + "</p>", goHome );
        return;
    }

    changeStatus( 0, "transparent", "<p class='running-text smaller center pointer'>" + _( "System Idle" ) + "</p>", goHome );
}

function calculateTotalRunningTime( runTimes ) {
    var sequential = 0,
        parallel = 0;

    $.each( controller.stations.snames, function( i ) {
        var run = runTimes[i];
        if ( isStationSequential( i ) ) {
            sequential += run;
        } else {
            if ( run > parallel ) {
                parallel = run;
            }
        }
    } );

    return Math.max( sequential, parallel );
}

// Handle timer update on the home page and status bar
function updateTimers() {
    var lastCheck = new Date().getTime();

    setInterval( function() {

		if ( !isControllerConnected() ) {
			return false;
		}

        // Handle time drift
        var now = new Date().getTime(),
            diff = now - lastCheck;

        if ( diff > 2000 ) {
            checkStatus();
            refreshStatus();
        }

        lastCheck = now;

        // If no timers are defined then exit
        if ( $.isEmptyObject( timers ) ) {
            return;
        }

        for ( var timer in timers ) {
            if ( timers.hasOwnProperty( timer ) ) {
                if ( timers[timer].val <= 0 ) {
                    if ( timer === "statusbar" ) {
                        showLoading( "#footer-running" );
                        refreshStatus();
                    }

                    if ( typeof timers[timer].done === "function" ) {
                        timers[timer].done();
                    }

                    delete timers[timer];
                } else {
                    if ( timer === "clock" ) {
                        ++timers[timer].val;
                        timers[timer].update();
                    } else if ( timer === "statusbar" || typeof timers[timer].station === "number" ) {
                        --timers[timer].val;
                        timers[timer].update();
                    }
                }
            }
        }
    }, 1000 );
}

// Manual control functions
var getManual = ( function() {
    var page = $( "<div data-role='page' id='manual'>" +
                "<div class='ui-content' role='main'>" +
                    "<p class='center'>" + _( "With manual mode turned on, tap a station to toggle it." ) + "</p>" +
                    "<fieldset data-role='collapsible' data-collapsed='false' data-mini='true'>" +
                        "<legend>" + _( "Options" ) + "</legend>" +
                        "<div class='ui-field-contain'>" +
                            "<label for='mmm'><b>" + _( "Manual Mode" ) + "</b></label>" +
                            "<input type='checkbox' data-on-text='On' data-off-text='Off' data-role='flipswitch' name='mmm' id='mmm'>" +
                        "</div>" +
                        "<p class='rain-desc smaller center' style='padding-top:5px'>" +
							_( "Station timer prevents a station from running indefinitely and will automatically turn it off after the set duration (or when toggled off)" ) +
						"</p>" +
                        "<div class='ui-field-contain duration-input'>" +
                            "<label for='auto-off'><b>" + _( "Station Timer" ) + "</b></label>" +
                            "<button data-mini='true' name='auto-off' id='auto-off' value='3600'>1h</button>" +
                        "</div>" +
                    "</fieldset>" +
                    "<div id='manual-station-list'>" +
                    "</div>" +
                "</div>" +
            "</div>" ),
        checkToggle = function( currPos ) {
            updateControllerStatus().done( function() {
                var item = listitems.eq( currPos ).find( "a" );

                if ( controller.options.mas ) {
                    if ( controller.status[controller.options.mas - 1] ) {
                        listitems.eq( controller.options.mas - 1 ).addClass( "green" );
                    } else {
                        listitems.eq( controller.options.mas - 1 ).removeClass( "green" );
                    }
                }

                item.text( controller.stations.snames[currPos] );

                if ( controller.status[currPos] ) {
                    item.removeClass( "yellow" ).addClass( "green" );
                } else {
                    item.removeClass( "green yellow" );
                }
            } );
        },
        toggle = function() {
            if ( !controller.settings.mm ) {
                showerror( _( "Manual mode is not enabled. Please enable manual mode then try again." ) );
                return false;
            }

            var anchor = $( this ),
                item = anchor.closest( "li" ),
                currPos = listitems.index( item ),
                sid = currPos + 1,
                dur = autoOff.val();

            if ( anchor.hasClass( "yellow" ) ) {
                return false;
            }

            if ( controller.status[currPos] ) {
                if ( checkOSPiVersion( "2.1" ) ) {
                    dest = "/sn?sid=" + sid + "&set_to=0&pw=";
                } else {
                    dest = "/sn" + sid + "=0";
                }
            } else {
                if ( checkOSPiVersion( "2.1" ) ) {
                    dest = "/sn?sid=" + sid + "&set_to=1&set_time=" + dur + "&pw=";
                } else {
                    dest = "/sn" + sid + "=1&t=" + dur;
                }
            }

            anchor.removeClass( "green" ).addClass( "yellow" );
            anchor.html( "<p class='ui-icon ui-icon-loading mini-load'></p>" );

            sendToOS( dest ).always(
                function() {

                    // The device usually replies before the station has actually toggled. Delay in order to wait for the station's to toggle.
                    setTimeout( checkToggle, 1000, currPos );
                }
            );

            return false;
        },
        autoOff = page.find( "#auto-off" ),
        dest, mmlist, listitems;

    page.on( "pagehide", function() {
        page.detach();
    } );

    storage.get( "autoOff", function( data ) {
        if ( !data.autoOff ) {
            return;
        }
        autoOff.val( data.autoOff );
        autoOff.text( dhms2str( sec2dhms( data.autoOff ) ) );
    } );

    autoOff.on( "click", function() {
        var dur = $( this ),
            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text();

        showDurationBox( {
            seconds: dur.val(),
            title: name,
            callback: function( result ) {
                dur.val( result );
                dur.text( dhms2str( sec2dhms( result ) ) );
                storage.set( { "autoOff":result } );
            },
            maximum: 32768
        } );

        return false;
    } );

/*
    page.one( "pagebeforeshow", function() {
		page.find( "#mmm" ).flipswitch();
    } )
*/

    page.find( "#mmm" ).on( "change", flipSwitched );

    function begin() {
		var list = "<li data-role='list-divider' data-theme='a'>" + _( "Sprinkler Stations" ) + "</li>";

		page.find( "#mmm" ).prop( "checked", controller.settings.mm ? true : false );

	    $.each( controller.stations.snames, function( i, station ) {
	        if ( isStationMaster( i ) ) {
	            list += "<li data-icon='false' class='center" + ( ( controller.status[i] ) ? " green" : "" ) +
					( isStationDisabled( i ) ? " station-hidden' style='display:none" : "" ) + "'>" + station + " (" + _( "Master" ) + ")</li>";
	        } else {
	            list += "<li data-icon='false'><a class='mm_station center" + ( ( controller.status[i] ) ? " green" : "" ) +
					( isStationDisabled( i ) ? " station-hidden' style='display:none" : "" ) + "'>" + station + "</a></li>";
	        }
	    } );

	    mmlist = $( "<ul data-role='listview' data-inset='true' id='mm_list'>" + list + "</ul>" );
	    listitems = mmlist.children( "li" ).slice( 1 );
	    mmlist.find( ".mm_station" ).on( "vclick", toggle );
	    page.find( "#manual-station-list" ).html( mmlist ).enhanceWithin();

	    changeHeader( {
	        title: _( "Manual Control" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: goBack
	        }
	    } );

	    $( "#manual" ).remove();
	    $.mobile.pageContainer.append( page );
    }

    return begin;
} )();

// Runonce functions
var getRunonce = ( function() {

    var page = $( "<div data-role='page' id='runonce'>" +
            "<div class='ui-content' role='main' id='runonce_list'>" +
            "</div>" +
        "</div>" ),
        updateLastRun = function( data ) {
            rprogs.l = data;
            $( "<option value='l' selected='selected'>" + _( "Last Used Program" ) + "</option>" )
				.insertAfter( page.find( "#rprog" ).find( "option[value='t']" ) );
            fillRunonce( data );
        },
        resetRunonce = function() {
            page.find( "[id^='zone-']" ).val( 0 ).text( "0s" ).removeClass( "green" );
            return false;
        },
        fillRunonce = function( data ) {
            page.find( "[id^='zone-']" ).each( function( a, b ) {
                if ( isStationMaster( a ) ) {
                    return;
                }

                var ele = $( b );
                ele.val( data[a] ).text( getDurationText( data[a] ) );
                if ( data[a] > 0 ) {
                    ele.addClass( "green" );
                } else {
                    ele.removeClass( "green" );
                }
            } );
        },
        i, list, quickPick, progs, rprogs, z, program, name;

    page.on( "pagehide", function() {
        page.detach();
    } );

    function begin() {
		list = "<p class='center'>" + _( "Zero value excludes the station from the run-once program." ) + "</p>";
	    progs = [];
	    if ( controller.programs.pd.length ) {
	        for ( z = 0; z < controller.programs.pd.length; z++ ) {
	            program = readProgram( controller.programs.pd[z] );
	            var prog = [];

	            if ( checkOSVersion( 210 ) ) {
	                prog = program.stations;
	            } else {
	                var setStations = program.stations.split( "" );
	                for ( i = 0; i < controller.stations.snames.length; i++ ) {
	                    prog.push( ( parseInt( setStations[i] ) ) ? program.duration : 0 );
	                }
	            }

	            progs.push( prog );
	        }
	    }
	    rprogs = progs;

	    quickPick = "<select data-mini='true' name='rprog' id='rprog'>" +
			"<option value='t'>" + _( "Test All Stations" ) + "</option><option value='s' selected='selected'>" + _( "Quick Programs" ) + "</option>";

	    for ( i = 0; i < progs.length; i++ ) {
	        if ( checkOSVersion( 210 ) ) {
	            name = controller.programs.pd[i][5];
	        } else {
	            name = _( "Program" ) + " " + ( i + 1 );
	        }
	        quickPick += "<option value='" + i + "'>" + name + "</option>";
	    }
	    quickPick += "</select>";
	    list += quickPick + "<form>";
	    $.each( controller.stations.snames, function( i, station ) {
	        if ( isStationMaster( i ) ) {
	            list += "<div class='ui-field-contain duration-input" + ( isStationDisabled( i ) ? " station-hidden' style='display:none" : "" ) + "'>" +
					"<label for='zone-" + i + "'>" + station + ":</label>" +
					"<button disabled='true' data-mini='true' name='zone-" + i + "' id='zone-" + i + "' value='0'>Master</button></div>";
	        } else {
	            list += "<div class='ui-field-contain duration-input" + ( isStationDisabled( i ) ? " station-hidden' style='display:none" : "" ) + "'>" +
					"<label for='zone-" + i + "'>" + station + ":</label>" +
					"<button data-mini='true' name='zone-" + i + "' id='zone-" + i + "' value='0'>0s</button></div>";
	        }
	    } );

	    list += "</form><a class='ui-btn ui-corner-all ui-shadow rsubmit' href='#'>" + _( "Submit" ) + "</a>" +
			"<a class='ui-btn ui-btn-b ui-corner-all ui-shadow rreset' href='#'>" + _( "Reset" ) + "</a>";

	    page.find( ".ui-content" ).html( list ).enhanceWithin();

	    if ( typeof controller.settings.rodur === "object" ) {
	        var total = 0;

	        for ( i = 0; i < controller.settings.rodur.length; i++ ) {
	            total += controller.settings.rodur[i];
	        }

	        if ( total !== 0 ) {
	            updateLastRun( controller.settings.rodur );
	        }
	    } else {
	        storage.get( "runonce", function( data ) {
	            data = data.runonce;
	            if ( data ) {
	                data = JSON.parse( data );
	                updateLastRun( data );
	            }
	        } );
	    }

	    page.find( "#rprog" ).on( "change", function() {
	        var prog = $( this ).val();
	        if ( prog === "s" ) {
	            resetRunonce();
	            return;
	        } else if ( prog === "t" ) {
	            fillRunonce( Array.apply( null, Array( controller.stations.snames.length ) ).map( function() {return 60;} ) );
	            return;
	        }
	        if ( typeof rprogs[prog] === "undefined" ) {
	            return;
	        }
	        fillRunonce( rprogs[prog] );
	    } );

	    page.on( "click", ".rsubmit", submitRunonce ).on( "click", ".rreset", resetRunonce );

	    page.find( "[id^='zone-']" ).on( "click", function() {
	        var dur = $( this ),
	            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text().slice( 0, -1 );

	        showDurationBox( {
	            seconds: dur.val(),
	            title: name,
	            callback: function( result ) {
	                dur.val( result );
	                dur.text( getDurationText( result ) );
	                if ( result > 0 ) {
	                    dur.addClass( "green" );
	                } else {
	                    dur.removeClass( "green" );
	                }
	            },
	            maximum: 65535,
	            showSun: checkOSVersion( 214 ) ? true : false
	        } );

	        return false;
	    } );

	    changeHeader( {
	        title: _( "Run-Once" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: goBack
	        },
	        rightBtn: {
	            icon: "check",
	            text: _( "Submit" ),
	            on: submitRunonce
	        }
	    } );

	    $( "#runonce" ).remove();
	    $.mobile.pageContainer.append( page );
	}

	return begin;
} )();

function submitRunonce( runonce ) {
    if ( !( runonce instanceof Array ) ) {
        runonce = [];
        $( "#runonce" ).find( "[id^='zone-']" ).each( function() {
            runonce.push( parseInt( this.value ) || 0 );
        } );
        runonce.push( 0 );
    }

    var submit = function() {
            $.mobile.loading( "show" );
            storage.set( { "runonce":JSON.stringify( runonce ) } );
            sendToOS( "/cr?pw=&t=" + JSON.stringify( runonce ) ).done( function() {
                $.mobile.loading( "hide" );
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Run-once program has been scheduled" ) );
                } );
                refreshStatus();
                goBack();
            } );
        },
        isOn = isRunning();

    if ( isOn !== -1 ) {
        areYouSure( _( "Do you want to stop the currently running program?" ), pidname( controller.settings.ps[isOn][0] ), function() {
            $.mobile.loading( "show" );
            stopStations( submit );
        } );
    } else {
        submit();
    }
}

// Preview functions
var getPreview = ( function() {
    var page = $( "<div data-role='page' id='preview'>" +
            "<div class='ui-content' role='main'>" +
                "<div id='preview_header' class='input_with_buttons'>" +
                    "<button class='preview-minus ui-btn ui-btn-icon-notext ui-icon-carat-l btn-no-border'></button>" +
                    "<input class='center' type='date' name='preview_date' id='preview_date'>" +
                    "<button class='preview-plus ui-btn ui-btn-icon-notext ui-icon-carat-r btn-no-border'></button>" +
                "</div>" +
                "<div id='timeline'></div>" +
                "<div data-role='controlgroup' data-type='horizontal' id='timeline-navigation'>" +
                    "<a class='ui-btn ui-corner-all ui-icon-plus ui-btn-icon-notext btn-no-border' title='" + _( "Zoom in" ) + "'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-minus ui-btn-icon-notext btn-no-border' title='" + _( "Zoom out" ) + "'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-carat-l ui-btn-icon-notext btn-no-border' title='" + _( "Move left" ) + "'></a>" +
                    "<a class='ui-btn ui-corner-all ui-icon-carat-r ui-btn-icon-notext btn-no-border' title='" + _( "Move right" ) + "'></a>" +
                "</div>" +
            "</div>" +
        "</div>" ),
        placeholder = page.find( "#timeline" ),
        navi = page.find( "#timeline-navigation" ),
        previewData, processPrograms, checkMatch, checkMatch183, checkMatch21, runSched, timeToText, changeday, render, date, day, now, is21, is211;

    placeholder.on( "swiperight swipeleft", function( e ) {
        e.stopImmediatePropagation();
    } );

    page.find( "#preview_date" ).on( "change", function() {
        date = this.value.split( "-" );
        day = new Date( date[0], date[1] - 1, date[2] );
        render();
    } );

    page.one( "pagebeforeshow", function() {
	    holdButton( page.find( ".preview-plus" ), function() {
	        changeday( 1 );
	    } );

	    holdButton( page.find( ".preview-minus" ), function() {
	        changeday( -1 );
	    } );
    } );

    page.on( {
        pagehide: function() {
            page.detach();
        },
        pageshow: function() {
			render();
        }
    } );

    processPrograms = function( month, day, year ) {
        previewData = [];
        var devday = Math.floor( controller.settings.devt / ( 60 * 60 * 24 ) ),
            simminutes = 0,
            simt = Date.UTC( year, month - 1, day, 0, 0, 0, 0 ),
            simday = ( simt / 1000 / 3600 / 24 ) >> 0,
            startArray = new Array( controller.settings.nbrd * 8 ),
            programArray = new Array( controller.settings.nbrd * 8 ),
            endArray = new Array( controller.settings.nbrd * 8 ),
            plArray = new Array( controller.settings.nbrd * 8 ),
            lastStopTime = 0,
            lastSeqStopTime = 0,
            busy, matchFound, prog;

        for ( var sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
            startArray[sid] = -1;programArray[sid] = 0;endArray[sid] = 0;plArray[sid] = 0;
        }
        do {
            busy = 0;
            matchFound = 0;
            for ( var pid = 0; pid < controller.programs.pd.length; pid++ ) {
                prog = controller.programs.pd[pid];
                if ( checkMatch( prog, simminutes, simt, simday, devday ) ) {
                    for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                        var bid = sid >> 3;var s = sid % 8;

						// Skip master station
                        if ( isStationMaster( sid ) ) {
                            continue;
                        }

                        if ( is21 ) {

							// Skip disabled stations
                            if ( controller.stations.stn_dis[bid] & ( 1 << s ) ) {
                                continue;
                            }

							// Skip if water time is zero, or station is already scheduled
                            if ( prog[4][sid] && endArray[sid] === 0 ) {

								// Use weather scaling bit on
                                if ( prog[0] & 0x02 && ( ( controller.options.uwt > 0 && simday === devday ) || controller.options.uwt === 0 ) ) {
                                    endArray[sid] = getStationDuration( prog[4][sid], simt ) * controller.options.wl / 100 >> 0;
                                } else {
                                    endArray[sid] = getStationDuration( prog[4][sid], simt );
                                }

								// After weather scaling, we maybe getting 0 water time
                                if ( endArray[sid] > 0 ) {
                                    programArray[sid] = pid + 1;
                                    matchFound = 1;
                                }
                            }
                        } else {
                            if ( prog[7 + bid] & ( 1 << s ) ) {
                                endArray[sid] = prog[6] * controller.options.wl / 100 >> 0;
                                programArray[sid] = pid + 1;
                                matchFound = 1;
                            }
                        }
                    }
              }
            }
            if ( matchFound ) {
                var acctime = simminutes * 60;
                var seqAcctime = acctime;
                if ( is211 ) {
                    if ( lastSeqStopTime > acctime ) {
                        seqAcctime = lastSeqStopTime + controller.options.sdt;
                    }
                    var bid2, s2;
                    for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                        bid2 = sid >> 3;
                        s2 = sid & 0x07;
                        if ( endArray[sid] === 0 || startArray[sid] >= 0 ) {
                            continue;
                        }
                        if ( controller.stations.stn_seq[bid2] & ( 1 << s2 ) ) {
                            startArray[sid] = seqAcctime;seqAcctime += endArray[sid];
                            endArray[sid] = seqAcctime;seqAcctime += controller.options.sdt;
                            plArray[sid] = 1;
                        } else {
                            startArray[sid] = acctime;
                            endArray[sid] = acctime + endArray[sid];
                            plArray[sid] = 1;
                        }
                        busy = 1;
                    }
                } else {
                    if ( is21 && controller.options.seq ) {
                        if ( lastStopTime > acctime ) {
                            acctime = lastStopTime + controller.options.sdt;
                        }
                    }
                    if ( controller.options.seq ) {
                        for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                            if ( endArray[sid] === 0 || programArray[sid] === 0 ) {
                                continue;
                            }
                            startArray[sid] = acctime;acctime += endArray[sid];
                            endArray[sid] = acctime;acctime += controller.options.sdt;
                            busy = 1;
                        }
                    } else {
                        for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                            if ( endArray[sid] === 0 || programArray[sid] === 0 ) {
                                continue;
                            }
                            startArray[sid] = acctime;
                            endArray[sid] = acctime + endArray[sid];
                            busy = 1;
                        }
                    }
                }
            }
            if ( busy ) {
                if ( is211 ) {
                    lastSeqStopTime = runSched( simminutes * 60, startArray, programArray, endArray, plArray, simt );
                    simminutes++;
                    for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                        if ( programArray[sid] > 0 && simminutes * 60 >= endArray[sid] ) {
                            startArray[sid] = -1;programArray[sid] = 0;endArray[sid] = 0;plArray[sid] = 0;
                        }
                    }
                } else if ( is21 ) {
                    lastStopTime = runSched( simminutes * 60, startArray, programArray, endArray, plArray, simt );
                    simminutes++;
                    for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                        startArray[sid] = -1;programArray[sid] = 0;endArray[sid] = 0;
                    }
                } else {
                    var endminutes = runSched( simminutes * 60, startArray, programArray, endArray, plArray, simt ) / 60 >> 0;
                    if ( controller.options.seq && simminutes !== endminutes ) {
                        simminutes = endminutes;
                    } else {
                        simminutes++;
                    }
                    for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                        startArray[sid] = -1;programArray[sid] = 0;endArray[sid] = 0;
                    }
                }
            } else {
                simminutes++;
                if ( is211 ) {
                  for ( sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
                      if ( programArray[sid] > 0 && simminutes * 60 >= endArray[sid] ) {
                          startArray[sid] = -1;programArray[sid] = 0;endArray[sid] = 0;plArray[sid] = 0;
                      }
                  }
                }
            }
        } while ( simminutes < 24 * 60 );
    };

    runSched = function( simseconds, startArray, programArray, endArray, plArray, simt ) {
        var endtime = simseconds;
        for ( var sid = 0; sid < controller.settings.nbrd * 8; sid++ ) {
            if ( programArray[sid] ) {
              if ( is211 ) {
                if ( plArray[sid] ) {
                    var mas2 = typeof controller.options.mas2 !== "undefined" ? true : false,
                        useMas1 = controller.stations.masop[sid >> 3] & ( 1 << ( sid % 8 ) ),
                        useMas2 = mas2 ? controller.stations.masop2[sid >> 3] & ( 1 << ( sid % 8 ) ) : false;

                    if ( !isStationMaster( sid ) ) {
                        if ( controller.options.mas > 0 && useMas1 ) {
                            previewData.push( {
                                "start": ( startArray[sid] + controller.options.mton ),
                                "end": ( endArray[sid] + controller.options.mtof ),
                                "content":"",
                                "className":"master",
                                "shortname":"M" + ( mas2 ? "1" : "" ),
                                "group":"Master",
                                "station": sid
                            } );
                        }

                        if ( mas2 && controller.options.mas2 > 0 && useMas2 ) {
                            previewData.push( {
                                "start": ( startArray[sid] + controller.options.mton2 ),
                                "end": ( endArray[sid] + controller.options.mtof2 ),
                                "content":"",
                                "className":"master",
                                "shortname":"M2",
                                "group":"Master 2",
                                "station": sid
                            } );
                        }
                    }

                    timeToText( sid, startArray[sid], programArray[sid], endArray[sid], simt );
                    plArray[sid] = 0;
                    if ( controller.stations.stn_seq[sid >> 3] & ( 1 << ( sid & 0x07 ) ) ) {
                      endtime = ( endtime > endArray[sid] ) ? endtime : endArray[sid];
                    }
                }
              } else {
                if ( controller.options.seq === 1 ) {
                    if ( isStationMaster( sid ) && ( controller.stations.masop[sid >> 3] & ( 1 << ( sid % 8 ) ) ) ) {
                        previewData.push( {
                            "start": ( startArray[sid] + controller.options.mton ),
                            "end": ( endArray[sid] + controller.options.mtof ),
                            "content":"",
                            "className":"master",
                            "shortname":"M",
                            "group":"Master",
                            "station": sid
                        } );
                    }
                    timeToText( sid, startArray[sid], programArray[sid], endArray[sid], simt );
                    endtime = endArray[sid];
                } else {
                    timeToText( sid, simseconds, programArray[sid], endArray[sid], simt );
                    if ( isStationMaster( sid ) && ( controller.stations.masop[sid >> 3] & ( 1 << ( sid % 8 ) ) ) ) {
                        endtime = ( endtime > endArray[sid] ) ? endtime : endArray[sid];
                    }
                }
              }
            }
        }
        if ( !is211 ) {
          if ( controller.options.seq === 0 && controller.options.mas > 0 ) {
              previewData.push( {
                  "start": simseconds,
                  "end": endtime,
                  "content":"",
                  "className":"master",
                  "shortname":"M",
                  "group":"Master",
                  "station": sid
              } );
          }
        }
        return endtime;
    };

    timeToText = function( sid, start, pid, end, simt ) {
        var className = "program-" + ( ( pid + 3 ) % 4 ),
            pname = "P" + pid;

        if ( ( ( controller.settings.rd !== 0 ) &&
			( simt + start + ( controller.options.tz - 48 ) * 900 <= controller.settings.rdst * 1000 ) ||
			controller.options.urs === 1 && controller.settings.rs === 1 ) &&
			( typeof controller.stations.ignore_rain === "object" &&
				( controller.stations.ignore_rain[parseInt( sid / 8 )] & ( 1 << ( sid % 8 ) ) ) === 0 ) ) {

            className = "delayed";
        }

        if ( checkOSVersion( 210 ) ) {
            pname = controller.programs.pd[pid - 1][5];
        }

        previewData.push( {
            "start": start,
            "end": end,
            "className":className,
            "content":pname,
            "pid": pid - 1,
            "shortname":"S" + ( sid + 1 ),
            "group": controller.stations.snames[sid],
            "station": sid
        } );
    };

    checkMatch = function( prog, simminutes, simt, simday, devday ) {
        if ( is21 ) {
            return checkMatch21( prog, simminutes, simt, simday, devday );
        } else {
            return checkMatch183( prog, simminutes, simt, simday, devday );
        }
    };

    checkMatch183 = function( prog, simminutes, simt, simday, devday ) {
        if ( prog[0] === 0 ) {
            return 0;
        }
        if ( ( prog[1] & 0x80 ) && ( prog[2] > 1 ) ) {
            var dn = prog[2],
                drem = prog[1] & 0x7f;
            if ( ( simday % dn ) !== ( ( devday + drem ) % dn ) ) {
                return 0;
            }
        } else {
            var date = new Date( simt );
            var wd = ( date.getUTCDay() + 6 ) % 7;
            if ( ( prog[1] & ( 1 << wd ) ) === 0 ) {
                return 0;
            }
            var dt = date.getUTCDate();
            if ( ( prog[1] & 0x80 ) && ( prog[2] === 0 ) ) {
                if ( ( dt % 2 ) !== 0 ) {
                    return 0;
                }
            }
            if ( ( prog[1] & 0x80 ) && ( prog[2] === 1 ) ) {
                if ( dt === 31 || ( dt === 29 && date.getUTCMonth() === 1 ) || ( dt % 2 ) !== 1 ) {
                    return 0;
                }
            }
        }
        if ( simminutes < prog[3] || ( simminutes > prog[4] || ( isOSPi() && simminutes >= prog[4] ) ) ) {
            return 0;
        }
        if ( prog[5] === 0 ) {
            return 0;
        }
        if ( ( ( simminutes - prog[3] ) / prog[5] >> 0 ) * prog[5] === ( simminutes - prog[3] ) ) {
            return 1;
        }
        return 0;
    };

    checkMatch21 = function( prog, simminutes, simt, simday, devday ) {
        var en = prog[0] & 0x01,
            oddeven = ( prog[0] >> 2 ) & 0x03,
            type = ( prog[0] >> 4 ) & 0x03,
            sttype = ( prog[0] >> 6 ) & 0x01,
            date = new Date( simt ),
            i;

        if ( en === 0 ) {
            return 0;
        }

        if ( type === 3 ) {

            // Interval program
            var dn = prog[2],
                drem = prog[1];

            if ( ( simday % dn ) !== ( ( devday + drem ) % dn ) ) {
                return 0;
            }
        } else if ( type === 0 ) {

            // Weekly program
            var wd = ( date.getUTCDay() + 6 ) % 7;
            if ( ( prog[1] & ( 1 << wd ) ) === 0 ) {
                return 0;
            }
        } else {
            return 0;
        }

        // odd/even restrictions
        if ( oddeven ) {
            var dt = date.getUTCDate();
            if ( oddeven === 2 ) {

                // even restrict
                if ( ( dt % 2 ) !== 0 ) {
                    return 0;
                }
            }
            if ( oddeven === 1 ) { // odd restrict
                if ( dt === 31 || ( dt === 29 && date.getUTCMonth() === 1 ) || ( dt % 2 ) !== 1 ) {
                    return 0;
                }
            }
        }

        // Start time matching
        if ( sttype === 0 ) {

            // Repeating program
            var start = getStartTime( prog[3][0], date ),
                repeat = prog[3][1],
                cycle = prog[3][2];

            if ( simminutes < start ) {
                return 0;
            }

            if ( repeat === 0 ) {

                // Single run program
                return ( simminutes === start ) ? 1 : 0;
            }

            if ( cycle === 0 ) {

                // if this is a multi-run, cycle time must be > 0
                return 0;
            }

            var c = Math.round( ( simminutes - start ) / cycle );
            if ( ( c * cycle === ( simminutes - start ) ) && ( c <= repeat ) ) {
                return 1;
            }
        } else {

            // Set start time program
            var sttimes = prog[3];
            for ( i = 0; i < 4; i++ ) {

                // fixme: 4 should be using the mnst (max_start_times) JSON variable
                if ( simminutes === getStartTime( sttimes[i], date ) ) {
                    return 1;
                }
            }
        }
        return 0;
    };

    changeday = function( dir ) {
        day.setDate( day.getDate() + dir );

        var m = pad( day.getMonth() + 1 ),
            d = pad( day.getDate() ),
            y = day.getFullYear();

        date = [ y, m, d ];
        page.find( "#preview_date" ).val( date.join( "-" ) );
        render();
    };

    render = function() {
        processPrograms( date[1], date[2], date[0] );

        navi.hide();

        if ( !previewData.length ) {
            page.find( "#timeline" ).html( "<p align='center'>" + _( "No stations set to run on this day." ) + "</p>" );
            return;
        }

        previewData.sort( sortByStation );

        var shortnames = [],
            max = new Date( date[0], date[1] - 1, date[2], 24 );

        $.each( previewData, function() {
            var total = this.start + this.end;

            this.start = new Date( date[0], date[1] - 1, date[2], 0, 0, this.start );
            if ( total > 86400 ) {
                var extraDays = Math.floor( this.end / 86400 );

                this.end = new Date( date[0], date[1] - 1, parseInt( date[2] ) + extraDays, 0, 0, this.end % 86400 );
                max = max > this.end ? max : this.end;

            } else {
                this.end = new Date( date[0], date[1] - 1, date[2], 0, 0, this.end );
            }
            shortnames[this.group] = this.shortname;
        } );

        var options = {
            "width":  "100%",
            "editable": false,
            "axisOnTop": true,
            "eventMargin": 10,
            "eventMarginAxis": 0,
            "min": new Date( date[0], date[1] - 1, date[2], 0 ),
            "max": max,
            "selectable": true,
            "showMajorLabels": false,
            "zoomMax": 1000 * 60 * 60 * 24,
            "zoomMin": 1000 * 60 * 60,
            "groupsChangeable": false,
            "showNavigation": false,
            "groupsOrder": "none",
            "groupMinHeight": 20
        },
        resize = function() {
            timeline.redraw();
        },
        timeline = new links.Timeline( placeholder[0], options ),
        currentTime = new Date( now );

        currentTime.setMinutes( currentTime.getMinutes() + currentTime.getTimezoneOffset() );

        timeline.setCurrentTime( currentTime );
        links.events.addListener( timeline, "select", function() {
            var sel = timeline.getSelection();

            if ( sel.length ) {
                if ( typeof sel[0].row !== "undefined" ) {
                    changePage( "#programs", {
                        "programToExpand": parseInt( timeline.getItem( sel[0].row ).pid )
                    } );
                }
            }
        } );

        $.mobile.window.on( "resize", resize );

        page.one( "pagehide", function() {
            $.mobile.window.off( "resize", resize );
        } );

        timeline.draw( previewData );

        page.find( ".timeline-groups-text" ).each( function() {
            var stn = $( this );
            var name = shortnames[stn.text()];
            stn.attr( "data-shortname", name );
        } );

        page.find( ".timeline-groups-axis" ).children().first().html( "<div class='timeline-axis-text center dayofweek' data-shortname='" +
			getDayName( day, "short" ) + "'>" + getDayName( day ) + "</div>" );

        if ( isAndroid ) {
		    navi.find( ".ui-icon-plus" ).off( "click" ).on( "click", function() {
		        timeline.zoom( 0.4 );
		        return false;
		    } );
		    navi.find( ".ui-icon-minus" ).off( "click" ).on( "click", function() {
		        timeline.zoom( -0.4 );
		        return false;
		    } );
		    navi.find( ".ui-icon-carat-l" ).off( "click" ).on( "click", function() {
		        timeline.move( -0.2 );
		        return false;
		    } );
		    navi.find( ".ui-icon-carat-r" ).off( "click" ).on( "click", function() {
		        timeline.move( 0.2 );
		        return false;
		    } );

		    navi.show();
        } else {
			navi.hide();
        }
    };

    function begin() {
	    is21 = checkOSVersion( 210 );
	    is211 = checkOSVersion( 211 );

	    if ( page.find( "#preview_date" ).val() === "" ) {
		    now = new Date( controller.settings.devt * 1000 );
		    date = now.toISOString().slice( 0, 10 ).split( "-" );
		    day = new Date( date[0], date[1] - 1, date[2] );
			page.find( "#preview_date" ).val( date.join( "-" ) );
		}

	    changeHeader( {
	        title: _( "Program Preview" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: goBack
	        }
	    } );

	    $( "#preview" ).remove();
	    $.mobile.pageContainer.append( page );
    }

    return begin;
} )();

function getStationDuration( duration, date ) {
    if ( checkOSVersion( 214 ) ) {
        var sunTimes = getSunTimes( date );

        if ( duration === 65535 ) {
            duration = ( ( sunTimes[0] + 1440 ) - sunTimes[1] ) * 60;
        } else if ( duration === 65534 ) {
            duration = ( sunTimes[1] - sunTimes[0] ) * 60;
        }
    }

    return duration;
}

// Logging functions
var getLogs = ( function() {

    var page = $( "<div data-role='page' id='logs'>" +
            "<div class='ui-content' role='main'>" +
                "<fieldset data-role='controlgroup' data-type='horizontal' data-mini='true' class='log_type'>" +
                    "<input data-mini='true' type='radio' name='log_type' id='log_timeline' value='timeline'>" +
                    "<label for='log_timeline'>" + _( "Timeline" ) + "</label>" +
                    "<input data-mini='true' type='radio' name='log_type' id='log_table' value='table'>" +
                    "<label for='log_table'>" + _( "Table" ) + "</label>" +
                "</fieldset>" +
                "<fieldset data-role='collapsible' data-mini='true' id='log_options' class='center'>" +
                    "<legend>" + _( "Options" ) + "</legend>" +
                    "<fieldset data-role='controlgroup' data-type='horizontal' id='table_sort'>" +
                      "<p class='tight'>" + _( "Grouping:" ) + "</p>" +
                      "<input data-mini='true' type='radio' name='table-group' id='table-sort-day' value='day' checked='checked'>" +
                      "<label for='table-sort-day'>" + _( "Day" ) + "</label>" +
                      "<input data-mini='true' type='radio' name='table-group' id='table-sort-station' value='station'>" +
                      "<label for='table-sort-station'>" + _( "Station" ) + "</label>" +
                    "</fieldset>" +
                    "<div class='ui-field-contain'>" +
                        "<label for='log_start'>" + _( "Start:" ) + "</label>" +
                        "<input data-mini='true' type='date' id='log_start'>" +
                        "<label for='log_end'>" + _( "End:" ) + "</label>" +
                        "<input data-mini='true' type='date' id='log_end'>" +
                    "</div>" +
                    "<a data-role='button' data-icon='action' class='export_logs' href='#' data-mini='true'>" + _( "Export" ) + "</a>" +
                    "<a data-role='button' class='red clear_logs' href='#' data-mini='true' data-icon='alert'>" +
						_( "Clear Logs" ) +
					"</a>" +
                "</fieldset>" +
                "<div id='logs_list' class='center'>" +
                "</div>" +
            "</div>" +
        "</div>" ),
        logsList = page.find( "#logs_list" ),
        tableSort = page.find( "#table_sort" ),
        logOptions = page.find( "#log_options" ),
        data = [],
        waterlog = [],
        sortData = function( type, grouping ) {
            var sortedData = [];

            if ( type === "table" && grouping === "station" ) {
                for ( i = 0; i < stations.length; i++ ) {
                    sortedData[i] = [];
                }
            }

            $.each( data, function() {
                var stamp = parseInt( this[3] * 1000 ),
                    station = this[1],
                    date = new Date( stamp ),
                    utc = new Date( date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),  date.getUTCHours(),
						date.getUTCMinutes(), date.getUTCSeconds() );

                if ( typeof station === "string" ) {
                    if ( station === "rs" ) {
                        station = stations.length - 2;
                    } else if ( station === "rd" ) {
                        station = stations.length - 1;
                    } else {
                        return;
                    }
                } else if ( typeof station === "number" && station > stations.length - 2 ) {
                    return;
                }

                if ( type === "table" ) {
                    switch ( grouping ) {
                        case "station":
                            sortedData[station].push( [ new Date( utc.getTime() - parseInt( this[2] * 1000 ) ),
								dhms2str( sec2dhms( parseInt( this[2] ) ) ) ] );
                            break;
                        case "day":
                            var day = Math.floor( date.getTime() / 1000 / 60 / 60 / 24 ),
                                item = [ new Date( utc.getTime() - parseInt( this[2] * 1000 ) ), dhms2str( sec2dhms( parseInt( this[2] ) ) ), station ];

                            if ( typeof sortedData[day] !== "object" ) {
                                sortedData[day] = [ item ];
                            } else {
                                sortedData[day].push( item );
                            }

                            break;
                    }
                } else if ( type === "timeline" ) {
                    var pid = parseInt( this[0] ),
                        className, name, group, shortname;

                    if ( this[1] === "rs" ) {
                        className = "delayed";
                        name = _( "Rain Sensor" );
                        group = name;
                        shortname = _( "RS" );
                    } else if ( this[1] === "rd" ) {
                        className = "delayed";
                        name = _( "Rain Delay" );
                        group = name;
                        shortname = _( "RD" );
                    } else if ( pid === 0 ) {
                        return;
                    } else {
                        className = "program-" + ( ( pid + 3 ) % 4 );
                        name = pidname( pid );
                        group = controller.stations.snames[station];
                        shortname = "S" + ( station + 1 );
                    }

                    sortedData.push( {
                        "start": new Date( utc.getTime() - parseInt( this[2] * 1000 ) ),
                        "end": utc,
                        "className": className,
                        "content": name,
                        "pid": pid - 1,
                        "shortname": shortname,
                        "group": group,
                        "station": station
                    } );
                }
            } );

            if ( type === "timeline" ) {
                sortedData.sort( sortByStation );
            }

            return sortedData;
        },
        success = function( items, wl ) {
            if ( typeof items !== "object" || items.length < 1 || ( items.result && items.result === 32 ) ) {
                $.mobile.loading( "hide" );
                resetLogsPage();
                return;
            }

            data = items;
            waterlog = $.isEmptyObject( wl ) ? [] : wl;

            updateView();

            exportObj( ".export_logs", data );

            $.mobile.loading( "hide" );
        },
        updateView = function() {
            if ( page.find( "#log_table" ).prop( "checked" ) ) {
                prepTable();
            } else if ( page.find( "#log_timeline" ).prop( "checked" ) ) {
                prepTimeline();
            }
        },
        prepTimeline = function() {
            if ( data.length < 1 ) {
                resetLogsPage();
                return;
            }

            tableSort.hide();
            logsList.show();

            logOptions.collapsible( "collapse" );

            var sortedData = sortData( "timeline" ),
                options = {
                    "width":  "100%",
                    "editable": false,
                    "axisOnTop": true,
                    "eventMargin": 10,
                    "eventMarginAxis": 0,
                    "min": dates().start,
                    "max": new Date( dates().end.getTime() + 86340000 ),
                    "selectable": false,
                    "showMajorLabels": false,
                    "groupsChangeable": false,
                    "showNavigation": false,
                    "groupsOrder": "none",
                    "groupMinHeight": 20,
                    "zoomMin": 1000 * 60
                },
                resize = function() {
                    timeline.redraw();
                },
                reset = function() {
                    $.mobile.window.off( "resize", resize );
                },
                shortnames = [];

            logsList.on( "swiperight swipeleft", function( e ) {
                e.stopImmediatePropagation();
            } );

            $.each( sortedData, function() {
                shortnames[this.group] = this.shortname;
            } );

            var timeline = new links.Timeline( logsList.get( 0 ), options );

            $.mobile.window.on( "resize", resize );
            page.one( "pagehide", reset );
            page.find( "input:radio[name='log_type']" ).one( "change", reset );

            timeline.draw( sortedData );

            logsList.find( ".timeline-groups-text" ).each( function() {
                this.setAttribute( "data-shortname", shortnames[this.textContent] );
            } );
        },
        prepTable = function() {
            if ( data.length < 1 ) {
                resetLogsPage();
                return;
            }

            tableSort.show();
            logsList.show();

            var grouping = page.find( "input:radio[name='table-group']:checked" ).val(),
                tableHeader = "<table><thead><tr><th data-priority='1'>" + _( "Runtime" ) + "</th>" +
					"<th data-priority='2'>" + ( grouping === "station" ? _( "Date/Time" ) : _( "Time" ) + "</th><th>" + _( "Station" ) ) + "</th>" +
					"</tr></thead><tbody>",
                html = "<div data-role='collapsible-set' data-inset='true' data-theme='b' data-collapsed-icon='arrow-d' data-expanded-icon='arrow-u'>",
                sortedData = sortData( "table", grouping ),
                groupArray = [],
                wlSorted = [],
                i = 0,
                group, ct, k;

            if ( !$.isEmptyObject( waterlog ) ) {
                $.each( waterlog, function() {
                    wlSorted[Math.floor( this[3] / 60 / 60 / 24 )] = this[2];
                } );
            }

            for ( group in sortedData ) {
                if ( sortedData.hasOwnProperty( group ) ) {
                    ct = sortedData[group].length;
                    if ( ct === 0 ) {
                        continue;
                    }
                    groupArray[i] = "<div data-role='collapsible' data-collapsed='true'><h2>" +
							( ( checkOSVersion( 210 ) && grouping === "day" ) ? "<a class='ui-btn red ui-btn-corner-all delete-day day-" +
								group + "'>" + _( "delete" ) + "</a>" : "" ) +
							"<div class='ui-btn-up-c ui-btn-corner-all custom-count-pos'>" +
								ct + " " + ( ( ct === 1 ) ? _( "run" ) : _( "runs" ) ) +
							"</div>" + ( grouping === "station" ? stations[group] : dateToString(
								new Date( group * 1000 * 60 * 60 * 24 )
							).slice( 0, -9 ) ) +
						"</h2>";

                    if ( wlSorted[group] ) {
                        groupArray[i] += "<span style='border:none' class='" +
							( wlSorted[group] !== 100 ? ( wlSorted[group] < 100 ? "green " : "red " ) : "" ) +
							"ui-body ui-body-a ui-corner-all'>" + _( "Average" ) + " " + _( "Water Level" ) + ": " + wlSorted[group] + "%</span>";
                    }

                    groupArray[i] += tableHeader;

                    for ( k = 0; k < sortedData[group].length; k++ ) {
                        var date = new Date( sortedData[group][k][0] );
                        groupArray[i] += "<tr><td>" + sortedData[group][k][1] + "</td><td>" +
							( grouping === "station" ? dateToString( date, false ) : pad( date.getHours() ) + ":" +
								pad( date.getMinutes() ) + ":" + pad( date.getSeconds() ) + "</td><td>" + stations[sortedData[group][k][2]] ) +
							"</td></tr>";
                    }
                    groupArray[i] += "</tbody></table></div>";

                    i++;
                }
            }

            if ( grouping === "day" ) {
                groupArray.reverse();
            }

            logOptions.collapsible( "collapse" );
            logsList.html( html + groupArray.join( "" ) + "</div>" ).enhanceWithin();

            logsList.find( ".delete-day" ).on( "click", function() {
                var day, date;

                $.each( this.className.split( " " ), function() {
                    if ( this.indexOf( "day-" ) === 0 ) {
                        day = this.split( "day-" )[1];
                        return false;
                    }
                } );

                date = dateToString( new Date( day * 1000 * 60 * 60 * 24 ) ).slice( 0, -9 );

                areYouSure( _( "Are you sure you want to " ) + _( "delete" ) + " " + date + "?", "", function() {
                    $.mobile.loading( "show" );
                    sendToOS( "/dl?pw=&day=" + day ).done( function() {
                        requestData();
                        showerror( date + " " + _( "deleted" ) );
                    } );
                } );

                return false;
            } );

            fixInputClick( logsList );
        },
        resetLogsPage = function() {
            data = [];
            logOptions.collapsible( "expand" );
            tableSort.hide();
            logsList.show().html( _( "No entries found in the selected date range" ) );
        },
        fail = function() {
            $.mobile.loading( "hide" );

            tableSort.empty().hide();
            logsList.show().html( _( "Error retrieving log data. Please refresh to try again." ) );
        },
        dates = function() {
            var sDate = logStart.val().split( "-" ),
                eDate = logEnd.val().split( "-" );
            return {
                start: new Date( sDate[0], sDate[1] - 1, sDate[2] ),
                end: new Date( eDate[0], eDate[1] - 1, eDate[2] )
            };
        },
        parms = function() {
            return "start=" + ( dates().start.getTime() / 1000 ) + "&end=" + ( ( dates().end.getTime() / 1000 ) + 86340 );
        },
        requestData = function() {
            var endtime = dates().end.getTime() / 1000,
                starttime = dates().start.getTime() / 1000;

            if ( endtime < starttime ) {
                resetLogsPage();
                showerror( _( "Start time cannot be greater than end time" ) );
                return;
            }

            var delay = 0;
            $.mobile.loading( "show" );

            if ( ( endtime - starttime ) > 31540000 ) {
                showerror( _( "The requested time span exceeds the maxiumum of 1 year and has been adjusted" ), 3500 );
                var nDate = dates().start;
                nDate.setFullYear( nDate.getFullYear() + 1 );
                $( "#log_end" ).val( nDate.getFullYear() + "-" + pad( nDate.getMonth() + 1 ) + "-" + pad( nDate.getDate() ) );
                delay = 500;
            }

            var defer = $.Deferred().resolve();

            if ( checkOSVersion( 211 ) ) {
                defer = sendToOS( "/jl?pw=&type=wl&" + parms(), "json" );
            }

            setTimeout( function() {
                $.when(
                    sendToOS( "/jl?pw=&" + parms(), "json" ),
                    defer
                ).then( success, fail );
            }, delay );
        },
		isNarrow = window.innerWidth < 640 ? true : false,
        logStart = page.find( "#log_start" ),
        logEnd = page.find( "#log_end" ),
        stations, logtimeout, i;

    // Bind clear logs button
    page.find( ".clear_logs" ).on( "click", function() {
        areYouSure( _( "Are you sure you want to clear ALL your log data?" ), "", function() {
            var url = isOSPi() ? "/cl?pw=" : "/dl?pw=&day=all";
            $.mobile.loading( "show" );
            sendToOS( url ).done( function() {
                requestData();
                showerror( _( "Logs have been cleared" ) );
            } );
        } );
        return false;
    } );

    //Automatically update the log viewer when changing the date range
    if ( isiOS ) {
        logStart.add( logEnd ).on( "blur", function() {
			if ( page.hasClass( "ui-page-active" ) ) {
				requestData();
			}
        } );
    } else {
        logStart.add( logEnd ).change( function() {
            clearTimeout( logtimeout );
            logtimeout = setTimeout( requestData, 1000 );
        } );
    }

    //Automatically update log viewer when switching table sort
    tableSort.find( "input[name='table-group']" ).change( function() {
        prepTable();
    } );

    //Bind view change buttons
    page.find( "input:radio[name='log_type']" ).change( updateView );

    page.on( {
        pagehide: function() {
            page.detach();
        },
        pageshow: requestData
    } );

	page.find( "#log_timeline" ).prop( "checked", !isNarrow );
	page.find( "#log_table" ).prop( "checked", isNarrow );

    function begin() {
		stations = $.merge( $.merge( [], controller.stations.snames ), [ _( "Rain Sensor" ), _( "Rain Delay" ) ] );
		page.find( ".clear_logs" ).toggleClass( "hidden", ( isOSPi() || checkOSVersion( 210 ) ?  false : true ) );

		if ( logStart.val() === "" || logEnd.val() === "" ) {
			var now = new Date( controller.settings.devt * 1000 );
			logStart.val( new Date( now.getTime() - 604800000 ).toISOString().slice( 0, 10 ) );
			logEnd.val( now.toISOString().slice( 0, 10 ) );
		}

	    changeHeader( {
	        title: _( "Logs" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: goBack
	        },
	        rightBtn: {
	            icon: "refresh",
	            text: _( "Refresh" ),
	            on: requestData
	        }
	    } );

	    $( "#logs" ).remove();
	    $.mobile.pageContainer.append( page );
	}

    return begin;
} )();

// Program management functions
var getPrograms = ( function() {
    var page = $( "<div data-role='page' id='programs'>" +
            "<div class='ui-content' role='main' id='programs_list'>" +
            "</div>" +
        "</div>" ),
		expandId;

    page
    .on( "programrefresh", updateContent )
    .on( "pagehide", function() {
        page.detach();
    } )
    .on( "pagebeforeshow", function() {
        updateProgramHeader();

        if ( typeof expandId !== "number" && controller.programs.pd.length === 1 ) {
            expandId = 0;
        }

        if ( typeof expandId === "number" ) {
            page.find( "fieldset[data-collapsed='false']" ).collapsible( "collapse" );
            $( "#program-" + expandId ).collapsible( "expand" );
        }
    } );

	function updateContent() {
		var list = $( makeAllPrograms() );

	    list.find( "[id^=program-]" ).on( {
	        collapsiblecollapse: function() {
	            $( this ).find( ".ui-collapsible-content" ).empty();
	        },
	        collapsiblebeforecollapse: function( e ) {
	            var program = $( this ),
	                changed = program.find( ".hasChanges" );

	            if ( changed.length ) {
	                areYouSure( _( "Do you want to save your changes?" ), "", function() {
	                    changed.removeClass( "hasChanges" ).click();
	                    program.collapsible( "collapse" );
	                }, function() {
	                    changed.removeClass( "hasChanges" );
	                    program.collapsible( "collapse" );
	                } );
	                e.preventDefault();
	            }
	        },
	        collapsibleexpand: function() {
	            expandProgram( $( this ) );
	        }
	    } );

	    if ( checkOSVersion( 210 ) ) {
	        list.find( ".move-up" ).removeClass( "hidden" ).on( "click", function() {
	            var group = $( this ).parents( "fieldset" ),
	                pid = parseInt( group.attr( "id" ).split( "-" )[1] );

	            $.mobile.loading( "show" );

	            sendToOS( "/up?pw=&pid=" + pid ).done( function() {
	                updateControllerPrograms( function() {
	                    $.mobile.loading( "hide" );
	                    page.trigger( "programrefresh" );
	                } );
	            } );

	            return false;
	        } );
	    }

	    list.find( ".program-copy" ).on( "click", function() {
	        var copyID = parseInt( $( this ).parents( "fieldset" ).attr( "id" ).split( "-" )[1] );

	        changePage( "#addprogram", {
	            copyID: copyID
	        } );

	        return false;
	    } );

	    page.find( "#programs_list" ).html( list.enhanceWithin() );
	}

	function begin( pid ) {
		expandId = pid;

	    changeHeader( {
	        title: _( "Programs" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: checkChangesBeforeBack
	        },
	        rightBtn: {
	            icon: "plus",
	            text: _( "Add" ),
	            on: function() {
	                checkChanges( function() {
	                    changePage( "#addprogram" );
	                } );
	            }
	        }

	    } );

	    updateContent();

	    $( "#programs" ).remove();
	    $.mobile.pageContainer.append( page );
	}

    return begin;
} )();

function expandProgram( program ) {
    var id = parseInt( program.attr( "id" ).split( "-" )[1] );

    program.find( ".ui-collapsible-content" ).html( makeProgram( id ) ).enhanceWithin().on( "change input click", function( e ) {
        if ( e.type === "click" && e.target.tagName !== "BUTTON" ) {
            return;
        }

        $( this ).off( "change input click" );
        program.find( "[id^='submit-']" ).addClass( "hasChanges" );
    } );

    program.find( "[id^='submit-']" ).on( "click", function() {
        submitProgram( id );
        return false;
    } );

    program.find( "[id^='delete-']" ).on( "click", function() {
        deleteProgram( id );
        return false;
    } );

    program.find( "[id^='run-']" ).on( "click", function() {
        var runonce = [],
			finish = function() {
		        runonce.push( 0 );
		        submitRunonce( runonce );
			};

        if ( checkOSVersion( 210 ) ) {
			runonce = controller.programs.pd[id][4];

			if ( ( controller.programs.pd[id][0] >> 1 ) & 1 ) {
				areYouSure( _( "Do you wish to apply the current watering level?" ), "", function() {
					for ( var i = runonce.length - 1; i >= 0; i-- ) {
						runonce[i] = parseInt( runonce[i] * ( controller.options.wl / 100 ) );
					}
					finish();
				}, finish );
				return false;
			}
        } else {
            var durr = parseInt( $( "#duration-" + id ).val() ),
                stations = $( "[id^='station_'][id$='-" + id + "']" );

            $.each( stations, function() {
                if ( $( this ).is( ":checked" ) ) {
                    runonce.push( durr );
                } else {
                    runonce.push( 0 );
                }
            } );
        }
        finish();
        return false;
    } );
}

// Translate program array into easier to use data
function readProgram( program ) {
    if ( checkOSVersion( 210 ) ) {
        return readProgram21( program );
    } else {
        return readProgram183( program );
    }
}

function readProgram183( program ) {
    var days0 = program[1],
        days1 = program[2],
        even = false,
        odd = false,
        interval = false,
        days = "",
        stations = "",
        newdata = {};

    newdata.en = program[0];
    for ( var n = 0; n < controller.programs.nboards; n++ ) {
        var bits = program[7 + n];
        for ( var s = 0; s < 8; s++ ) {
            stations += ( bits & ( 1 << s ) ) ? "1" : "0";
        }
    }
    newdata.stations = stations;
    newdata.duration = program[6];

    newdata.start = program[3];
    newdata.end = program[4];
    newdata.interval = program[5];

    if ( ( days0 & 0x80 ) && ( days1 > 1 ) ) {

        //This is an interval program
        days = [ days1, days0 & 0x7f ];
        interval = true;
    } else {

        //This is a weekly program
        for ( var d = 0; d < 7; d++ ) {
            if ( days0 & ( 1 << d ) ) {
                days += "1";
            } else {
                days += "0";
            }
        }
        if ( ( days0 & 0x80 ) && ( days1 === 0 ) ) {even = true;}
        if ( ( days0 & 0x80 ) && ( days1 === 1 ) ) {odd = true;}
    }

    newdata.days = days;
    newdata.is_even = even;
    newdata.is_odd = odd;
    newdata.is_interval = interval;

    return newdata;
}

// Read program for OpenSprinkler 2.1+
function readProgram21( program ) {
    var days0 = program[1],
        days1 = program[2],
        restrict = ( ( program[0] >> 2 ) & 0x03 ),
        type = ( ( program[0] >> 4 ) & 0x03 ),
        startType = ( ( program[0] >> 6 ) & 0x01 ),
        days = "",
        newdata = {
            repeat: 0,
            interval: 0
        };

    newdata.en = ( program[0] >> 0 ) & 1;
    newdata.weather = ( program[0] >> 1 ) & 1;
    newdata.is_even = ( restrict === 2 ) ? true : false;
    newdata.is_odd = ( restrict === 1 ) ? true : false;
    newdata.is_interval = ( type === 3 ) ? true : false;
    newdata.stations = program[4];
    newdata.name = program[5];

    if ( startType === 0 ) {
        newdata.start = program[3][0];
        newdata.repeat = program[3][1];
        newdata.interval = program[3][2];
    } else if ( startType === 1 ) {
        newdata.start = program[3];
    }

    if ( type === 3 ) {

        //This is an interval program
        days = [ days1, days0 ];
    } else if ( type === 0 ) {

        //This is a weekly program
        for ( var d = 0; d < 7; d++ ) {
            if ( days0 & ( 1 << d ) ) {
                days += "1";
            } else {
                days += "0";
            }
        }
    }

    newdata.days = days;
    return newdata;
}

function getStartTime( time, date ) {
    var offset = time & 0x7ff,
        type = 0,
        times = getSunTimes( date );

    if ( time < 0 ) {
        return time;
    }

    if ( ( time >> 13 ) & 1 ) {
        type = 1;
    } else if ( !( time >> 14 ) & 1 ) {
        return time;
    }

    if ( ( time >> 12 ) & 1 ) {
        offset = -offset;
    }

    time = times[type];
    time += offset;

    if ( time < 0 ) {
        time = 0;
    } else if ( time > 1440 ) {
        time = 1440;
    }

    return time;
}

function readStartTime( time ) {
    var offset = time & 0x7ff,
        type = _( "Sunrise" );

    if ( ( time >> 13 ) & 1 ) {
        type = _( "Sunset" );
    } else if ( !( time >> 14 ) & 1 ) {
        return minutesToTime( time );
    }

    if ( ( time >> 12 ) & 1 ) {
        offset = -offset;
    }

    return type + ( offset !== 0 ? ( offset > 0 ? "+" : "" ) + dhms2str( sec2dhms( offset * 60 ) ) : "" );
}

// Translate program ID to it's name
function pidname( pid ) {
    var pname = _( "Program" ) + " " + pid;

    if ( pid === 255 || pid === 99 ) {
        pname = _( "Manual program" );
    } else if ( pid === 254 || pid === 98 ) {
        pname = _( "Run-once program" );
    } else if ( checkOSVersion( 210 ) && pid <= controller.programs.pd.length ) {
        pname = controller.programs.pd[pid - 1][5];
    }

    return pname;
}

// Check each program and change the background color to red if disabled
function updateProgramHeader() {
    $( "#programs_list" ).find( "[id^=program-]" ).each( function( a, b ) {
        var item = $( b ),
            heading = item.find( ".ui-collapsible-heading-toggle" ),
            en = checkOSVersion( 210 ) ? ( controller.programs.pd[a][0] ) & 0x01 : controller.programs.pd[a][0];

        if ( en ) {
            heading.removeClass( "red" );
        } else {
            heading.addClass( "red" );
        }
    } );
}

//Make the list of all programs
function makeAllPrograms() {
    if ( controller.programs.pd.length === 0 ) {
        return "<p class='center'>" + _( "You have no programs currently added. Tap the Add button on the top right corner to get started." ) + "</p>";
    }
    var list = "<p class='center'>" + _( "Click any program below to expand/edit. Be sure to save changes." ) + "</p><div data-role='collapsible-set'>",
        name;

    for ( var i = 0; i < controller.programs.pd.length; i++ ) {
        name = _( "Program" ) + " " + ( i + 1 );
        if ( checkOSVersion( 210 ) ) {
            name = controller.programs.pd[i][5];
        }
        list += "<fieldset id='program-" + i + "' data-role='collapsible'><h3><a " + ( i > 0 ? "" : "style='visibility:hidden' " ) +
				"class='hidden ui-btn ui-btn-icon-notext ui-icon-arrow-u ui-btn-corner-all move-up'></a><a class='ui-btn ui-btn-corner-all program-copy'>" +
			_( "copy" ) + "</a><span class='program-name'>" + name + "</span></h3>";
        list += "</fieldset>";
    }
    return list + "</div>";
}

function makeProgram( n, isCopy ) {
    if ( checkOSVersion( 210 ) ) {
        return makeProgram21( n, isCopy );
    } else {
        return makeProgram183( n, isCopy );
    }
}

function makeProgram183( n, isCopy ) {
    var week = [ _( "Monday" ), _( "Tuesday" ), _( "Wednesday" ), _( "Thursday" ), _( "Friday" ), _( "Saturday" ), _( "Sunday" ) ],
        list = "",
        id = isCopy ? "new" : n,
        days, i, j, setStations, program, page;

    if ( n === "new" ) {
        program = { "en":0, "weather":0, "is_interval":0, "is_even":0, "is_odd":0, "duration":0, "interval":0, "start":0, "end":0, "days":[ 0, 0 ] };
    } else {
        program = readProgram( controller.programs.pd[n] );
    }

    if ( typeof program.days === "string" ) {
        days = program.days.split( "" );
        for ( i = days.length; i--; ) {
            days[i] = days[i] | 0;
        }
    } else {
        days = [ 0, 0, 0, 0, 0, 0, 0 ];
    }
    if ( typeof program.stations !== "undefined" ) {
        setStations = program.stations.split( "" );
        for ( i = setStations.length - 1; i >= 0; i-- ) {
            setStations[i] = setStations[i] | 0;
        }
    }
    list += "<label for='en-" + id + "'><input data-mini='true' type='checkbox' " + ( ( program.en || n === "new" ) ? "checked='checked'" : "" ) + " name='en-" + id + "' id='en-" + id + "'>" + _( "Enabled" ) + "</label>";
    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<input data-mini='true' type='radio' name='rad_days-" + id + "' id='days_week-" + id + "' " +
			"value='days_week-" + id + "' " + ( ( program.is_interval ) ? "" : "checked='checked'" ) + ">" +
		"<label for='days_week-" + id + "'>" + _( "Weekly" ) + "</label>";
    list += "<input data-mini='true' type='radio' name='rad_days-" + id + "' id='days_n-" + id + "' " +
			"value='days_n-" + id + "' " + ( ( program.is_interval ) ? "checked='checked'" : "" ) + ">" +
		"<label for='days_n-" + id + "'>" + _( "Interval" ) + "</label>";
    list += "</fieldset><div id='input_days_week-" + id + "' " + ( ( program.is_interval ) ? "style='display:none'" : "" ) + ">";

    list += "<div class='center'><p class='tight'>" + _( "Restrictions" ) + "</p>" +
		"<select data-inline='true' data-iconpos='left' data-mini='true' id='days_rst-" + id + "'>";
    list += "<option value='none' " + ( ( !program.is_even && !program.is_odd ) ? "selected='selected'" : "" ) + ">" + _( "None" ) + "</option>";
    list += "<option value='odd' " + ( ( !program.is_even && program.is_odd ) ? "selected='selected'" : "" ) + ">" + _( "Odd Days" ) + "</option>";
    list += "<option value='even' " + ( ( !program.is_odd && program.is_even ) ? "selected='selected'" : "" ) + ">" + _( "Even Days" ) + "</option>";
    list += "</select></div>";

    list += "<div class='center'><p class='tight'>" + _( "Days of the Week" ) + "</p>" +
		"<select " + ( $.mobile.window.width() > 560 ? "data-inline='true' " : "" ) + "data-iconpos='left' data-mini='true' " +
			"multiple='multiple' data-native-menu='false' id='d-" + id + "'><option>" + _( "Choose day(s)" ) + "</option>";

    for ( j = 0; j < week.length; j++ ) {
        list += "<option " + ( ( !program.is_interval && days[j] ) ? "selected='selected'" : "" ) + " value='" + j + "'>" + week[j] + "</option>";
    }
    list += "</select></div></div>";

    list += "<div " + ( ( program.is_interval ) ? "" : "style='display:none'" ) + " id='input_days_n-" + id + "' class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label class='center' for='every-" + id + "'>" + _( "Interval (Days)" ) + "</label>" +
		"<input data-wrapper-class='pad_buttons' data-mini='true' type='number' name='every-" + id + "' pattern='[0-9]*' id='every-" + id + "' " +
			"value='" + program.days[0] + "'></div>";
    list += "<div class='ui-block-b'><label class='center' for='starting-" + id + "'>" + _( "Starting In" ) + "</label>" +
		"<input data-wrapper-class='pad_buttons' data-mini='true' type='number' name='starting-" + id + "' pattern='[0-9]*' " +
			"id='starting-" + id + "' value='" + program.days[1] + "'></div>";
    list += "</div>";

    list += "<fieldset data-role='controlgroup'><legend>" + _( "Stations:" ) + "</legend>";

    for ( j = 0; j < controller.stations.snames.length; j++ ) {
        list += "<label for='station_" + j + "-" + id + "'><input " +
			( isStationDisabled( j ) ? "data-wrapper-class='station-hidden hidden' " : "" ) +
			"data-mini='true' type='checkbox' " + ( ( ( typeof setStations !== "undefined" ) && setStations[j] ) ? "checked='checked'" : "" ) +
			" name='station_" + j + "-" + id + "' id='station_" + j + "-" + id + "'>" + controller.stations.snames[j] + "</label>";
    }

    list += "</fieldset>";
    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<button class='ui-btn ui-mini' name='s_checkall-" + id + "' id='s_checkall-" + id + "'>" + _( "Check All" ) + "</button>";
    list += "<button class='ui-btn ui-mini' name='s_uncheckall-" + id + "' id='s_uncheckall-" + id + "'>" + _( "Uncheck All" ) + "</button>";
    list += "</fieldset>";

    list += "<div class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label class='center' for='start-" + id + "'>" + _( "Start Time" ) + "</label>" +
		"<button class='timefield pad_buttons' data-mini='true' id='start-" + id + "' value='" + program.start + "'>" +
		minutesToTime( program.start ) + "</button></div>";
    list += "<div class='ui-block-b'><label class='center' for='end-" + id + "'>" + _( "End Time" ) + "</label>" +
		"<button class='timefield pad_buttons' data-mini='true' id='end-" + id + "' value='" + program.end + "'>" +
		minutesToTime( program.end ) + "</button></div>";
    list += "</div>";

    list += "<div class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label class='pad_buttons center' for='duration-" + id + "'>" + _( "Station Duration" ) + "</label>" +
		"<button class='pad_buttons' data-mini='true' name='duration-" + id + "' id='duration-" + id + "' value='" + program.duration + "'>" +
		dhms2str( sec2dhms( program.duration ) ) + "</button></div>";
    list += "<div class='ui-block-b'><label class='pad_buttons center' for='interval-" + id + "'>" + _( "Program Interval" ) + "</label>" +
		"<button class='pad_buttons' data-mini='true' name='interval-" + id + "' id='interval-" + id + "' value='" + program.interval * 60 + "'>" +
		dhms2str( sec2dhms( program.interval * 60 ) ) + "</button></div>";
    list += "</div>";

    if ( isCopy === true || n === "new" ) {
        list += "<input data-mini='true' data-icon='check' type='submit' data-theme='b' name='submit-" + id + "' id='submit-" + id + "' " +
			"value='" + _( "Save New Program" ) + "'>";
    } else {
        list += "<button data-mini='true' data-icon='check' data-theme='b' name='submit-" + id + "' id='submit-" + id + "'>" +
			_( "Save Changes to Program" ) + " " + ( n + 1 ) + "</button>";
        list += "<button data-mini='true' data-icon='arrow-r' name='run-" + id + "' id='run-" + id + "'>" +
			_( "Run Program" ) + " " + ( n + 1 ) + "</button>";
        list += "<button data-mini='true' data-icon='delete' class='red bold' data-theme='b' name='delete-" + id + "' id='delete-" + id + "'>" +
			_( "Delete Program" ) + " " + ( n + 1 ) + "</button>";
    }

    page = $( list );

    page.find( "input[name^='rad_days']" ).on( "change", function() {
        var type = $( this ).val().split( "-" )[0],
            old;

        type = type.split( "_" )[1];
        if ( type === "n" ) {
            old = "week";
        } else {
            old = "n";
        }
        $( "#input_days_" + type + "-" + id ).show();
        $( "#input_days_" + old + "-" + id ).hide();
    } );

    page.find( "[id^='duration-'],[id^='interval-']" ).on( "click", function() {
        var dur = $( this ),
            isInterval = dur.attr( "id" ).match( "interval" ) ? 1 : 0,
            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text();

        showDurationBox( {
            seconds: dur.val(),
            title: name,
            callback: function( result ) {
                dur.val( result );
                dur.text( dhms2str( sec2dhms( result ) ) );
            },
            maximum: isInterval ? 86340 : 65535,
            granularity: isInterval
        } );
    } );

    page.find( ".timefield" ).on( "click", function() {
        var time = $( this ),
            name = page.find( "label[for='" + time.attr( "id" ) + "']" ).text();

        showTimeInput( {
            minutes: time.val(),
            title: name,
            callback: function( result ) {
                time.val( result );
                time.text( minutesToTime( result ) );
            }
        } );
    } );

    page.find( "[id^='s_checkall-']" ).on( "click", function() {
        page.find( "[id^='station_'][id$='-" + id + "']" ).prop( "checked", true ).checkboxradio( "refresh" );
        return false;
    } );

    page.find( "[id^='s_uncheckall-']" ).on( "click", function() {
        page.find( "[id^='station_'][id$='-" + id + "']" ).prop( "checked", false ).checkboxradio( "refresh" );
        return false;
    } );

    fixInputClick( page );

    return page;
}

function makeProgram21( n, isCopy ) {
    var week = [ _( "Monday" ), _( "Tuesday" ), _( "Wednesday" ), _( "Thursday" ), _( "Friday" ), _( "Saturday" ), _( "Sunday" ) ],
        list = "",
        id = isCopy ? "new" : n,
        days, i, j, program, page, times, time, unchecked;

    if ( n === "new" ) {
        program = { "name":"", "en":0, "weather":0, "is_interval":0, "is_even":0, "is_odd":0, "interval":0, "start":0, "days":[ 0, 0 ], "repeat":0, "stations":[] };
    } else {
        program = readProgram( controller.programs.pd[n] );
    }

    if ( typeof program.days === "string" ) {
        days = program.days.split( "" );
        for ( i = days.length; i--; ) {
            days[i] = days[i] | 0;
        }
    } else {
        days = [ 0, 0, 0, 0, 0, 0, 0 ];
    }

    if ( typeof program.start === "object" ) {
        times = program.start;
    } else {
        times = [ program.start, -1, -1, -1 ];
    }

    // Group basic settings visually
    list += "<div style='margin-top:5px' class='ui-corner-all'>";
    list += "<div class='ui-bar ui-bar-a'><h3>" + _( "Basic Settings" ) + "</h3></div>";
    list += "<div class='ui-body ui-body-a center'>";

    // Progran name
    list += "<label for='name-" + id + "'>" + _( "Program Name" ) + "</label>" +
		"<input data-mini='true' type='text' name='name-" + id + "' id='name-" + id + "' maxlength='" + controller.programs.pnsize + "' " +
		"placeholder='" + _( "Program" ) + " " + ( controller.programs.pd.length + 1 ) + "' value='" + program.name + "'>";

    // Program enable/disable flag
    list += "<label for='en-" + id + "'><input data-mini='true' type='checkbox' " +
		( ( program.en || n === "new" ) ? "checked='checked'" : "" ) + " name='en-" + id + "' id='en-" + id + "'>" + _( "Enabled" ) + "</label>";

    // Program weather control flag
    list += "<label for='uwt-" + id + "'><input data-mini='true' type='checkbox' " +
		( ( program.weather ) ? "checked='checked'" : "" ) + " name='uwt-" + id + "' id='uwt-" + id + "'>" + _( "Use Weather Adjustment" ) + "</label>";

    // Show start time menu
    list += "<label class='center' for='start_1-" + id + "'>" + _( "Start Time" ) + "</label><button class='timefield' data-mini='true' id='start_1-" + id + "' value='" + times[0] + "'>" + readStartTime( times[0] ) + "</button>";

    // Close basic settings group
    list += "</div></div></div></div>";

    // Group all program type options visually
    list += "<div style='margin-top:10px' class='ui-corner-all'>";
    list += "<div class='ui-bar ui-bar-a'><h3>" + _( "Program Type" ) + "</h3></div>";
    list += "<div class='ui-body ui-body-a'>";

    // Controlgroup to handle program type (weekly/interval)
    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<input data-mini='true' type='radio' name='rad_days-" + id + "' id='days_week-" + id + "' " +
		"value='days_week-" + id + "' " + ( ( program.is_interval ) ? "" : "checked='checked'" ) + ">" +
		"<label for='days_week-" + id + "'>" + _( "Weekly" ) + "</label>";
    list += "<input data-mini='true' type='radio' name='rad_days-" + id + "' id='days_n-" + id + "' " +
		"value='days_n-" + id + "' " + ( ( program.is_interval ) ? "checked='checked'" : "" ) + ">" +
		"<label for='days_n-" + id + "'>" + _( "Interval" ) + "</label>";
    list += "</fieldset>";

    // Show weekly program options
    list += "<div id='input_days_week-" + id + "' " + ( ( program.is_interval ) ? "style='display:none'" : "" ) + ">";
    list += "<div class='center'><p class='tight'>" + _( "Days of the Week" ) + "</p>" +
		"<select " + ( $.mobile.window.width() > 560 ? "data-inline='true' " : "" ) + "data-iconpos='left' data-mini='true' " +
			"multiple='multiple' data-native-menu='false' id='d-" + id + "'>" +
		"<option>" + _( "Choose day(s)" ) + "</option>";
    for ( j = 0; j < week.length; j++ ) {
        list += "<option " + ( ( !program.is_interval && days[j] ) ? "selected='selected'" : "" ) + " value='" + j + "'>" + week[j] + "</option>";
    }
    list += "</select></div></div>";

    // Show interval program options
    list += "<div " + ( ( program.is_interval ) ? "" : "style='display:none'" ) + " id='input_days_n-" + id + "' class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label class='center' for='every-" + id + "'>" + _( "Interval (Days)" ) + "</label>" +
		"<input data-wrapper-class='pad_buttons' data-mini='true' type='number' name='every-" + id + "' pattern='[0-9]*' " +
			"id='every-" + id + "' value='" + program.days[0] + "'></div>";
    list += "<div class='ui-block-b'><label class='center' for='starting-" + id + "'>" + _( "Starting In" ) + "</label>" +
		"<input data-wrapper-class='pad_buttons' data-mini='true' type='number' name='starting-" + id + "' pattern='[0-9]*' " +
			"id='starting-" + id + "' value='" + program.days[1] + "'></div>";
    list += "</div>";

    // Show restriction options
    list += "<div class='center'><p class='tight'>" + _( "Restrictions" ) + "</p><select data-inline='true' data-iconpos='left' data-mini='true' id='days_rst-" + id + "'>";
    list += "<option value='none' " + ( ( !program.is_even && !program.is_odd ) ? "selected='selected'" : "" ) + ">" + _( "None" ) + "</option>";
    list += "<option value='odd' " + ( ( !program.is_even && program.is_odd ) ? "selected='selected'" : "" ) + ">" + _( "Odd Days" ) + "</option>";
    list += "<option value='even' " + ( ( !program.is_odd && program.is_even ) ? "selected='selected'" : "" ) + ">" + _( "Even Days" ) + "</option>";
    list += "</select></div>";

    // Close program type group
    list += "</div></div>";

    // Group all stations visually
    list += "<div style='margin-top:10px' class='ui-corner-all'>";
    list += "<div class='ui-bar ui-bar-a'><h3>" + _( "Stations" ) + "</h3></div>";
    list += "<div class='ui-body ui-body-a'>";

    var hideDisabled = $( "#programs" ).hasClass( "show-hidden" ) ? "" : "' style='display:none";

    // Show station duration inputs
    for ( j = 0; j < controller.stations.snames.length; j++ ) {
        if ( isStationMaster( j ) ) {
            list += "<div class='ui-field-contain duration-input" + ( isStationDisabled( j ) ? " station-hidden" + hideDisabled : "" ) + "'>" +
				"<label for='station_" + j + "-" + id + "'>" + controller.stations.snames[j] + ":</label>" +
				"<button disabled='true' data-mini='true' name='station_" + j + "-" + id + "' id='station_" + j + "-" + id + "' value='0'>" +
				_( "Master" ) + "</button></div>";
        } else {
            time = program.stations[j] || 0;
            list += "<div class='ui-field-contain duration-input" + ( isStationDisabled( j ) ? " station-hidden" + hideDisabled : "" ) + "'>" +
				"<label for='station_" + j + "-" + id + "'>" + controller.stations.snames[j] + ":</label>" +
				"<button " + ( time > 0 ? "class='green' " : "" ) + "data-mini='true' name='station_" + j + "-" + id + "' " +
					"id='station_" + j + "-" + id + "' value='" + time + "'>" + getDurationText( time ) + "</button></div>";
        }
    }

    // Close station group
    list += "</div></div>";

    // Group all start time options visually
    list += "<div style='margin-top:10px' class='ui-corner-all'>";
    list += "<div class='ui-bar ui-bar-a'><h3>" + _( "Additional Start Times" ) + "</h3></div>";
    list += "<div class='ui-body ui-body-a'>";

    // Controlgroup to handle start time type (repeating or set times)
    list += "<fieldset data-role='controlgroup' data-type='horizontal' class='center'>";
    list += "<input data-mini='true' type='radio' name='stype-" + id + "' id='stype_repeat-" + id + "' value='stype_repeat-" + id + "' " +
			( ( typeof program.start === "object" ) ? "" : "checked='checked'" ) + ">" +
		"<label for='stype_repeat-" + id + "'>" + _( "Repeating" ) + "</label>";
    list += "<input data-mini='true' type='radio' name='stype-" + id + "' id='stype_set-" + id + "' value='stype_set-" + id + "' " +
			( ( typeof program.start === "object" ) ? "checked='checked'" : "" ) + ">" +
		"<label for='stype_set-" + id + "'>" + _( "Fixed" ) + "</label>";
    list += "</fieldset>";

    // Show repeating start time options
    list += "<div " + ( ( typeof program.start === "object" ) ? "style='display:none'" : "" ) + " id='input_stype_repeat-" + id + "'>";
    list += "<div class='ui-grid-a'>";
    list += "<div class='ui-block-a'><label class='pad_buttons center' for='interval-" + id + "'>" + _( "Repeat Every" ) + "</label>" +
		"<button class='pad_buttons' data-mini='true' name='interval-" + id + "' id='interval-" + id + "' " +
			"value='" + program.interval * 60 + "'>" + dhms2str( sec2dhms( program.interval * 60 ) ) + "</button></div>";
    list += "<div class='ui-block-b'><label class='pad_buttons center' for='repeat-" + id + "'>" + _( "Repeat Count" ) + "</label>" +
		"<button class='pad_buttons' data-mini='true' name='repeat-" + id + "' id='repeat-" + id + "' value='" + program.repeat + "'>" +
			program.repeat + "</button></div>";
    list += "</div></div>";

    // Show set times options
    list += "<table style='width:100%;" + ( ( typeof program.start === "object" ) ? "" : "display:none" ) + "' id='input_stype_set-" + id + "'><tr><th class='center'>" + _( "Enable" ) + "</th><th>" + _( "Start Time" ) + "</th></tr>";
    for ( j = 1; j < 4; j++ ) {
        unchecked = ( times[j] === -1 );
        list += "<tr><td data-role='controlgroup' data-type='horizontal' class='use_master center'><label for='ust_" + ( j + 1 ) + "'><input id='ust_" + ( j + 1 ) + "' type='checkbox' " + ( unchecked ? "" : "checked='checked'" ) + "></label></td>";
        list += "<td><button class='timefield' data-mini='true' type='time' id='start_" + ( j + 1 ) + "-" + id + "' value='" + ( unchecked ? 0 : times[j] ) + "'>" + readStartTime( unchecked ? 0 : times[j] ) + "</button></td></tr>";
    }

    list += "</table>";

    // Close start time type group
    list += "</div></div>";

    // Show save, run and delete buttons
    if ( isCopy === true || n === "new" ) {
        list += "<button data-mini='true' data-icon='check' data-theme='b' id='submit-" + id + "'>" + _( "Save New Program" ) + "</button>";
    } else {
        list += "<button data-mini='true' data-icon='check' data-theme='b' id='submit-" + id + "'>" + _( "Save Changes to" ) + " <span class='program-name'>" + program.name + "</span></button>";
        list += "<button data-mini='true' data-icon='arrow-r' id='run-" + id + "'>" + _( "Run" ) + " <span class='program-name'>" + program.name + "</span></button>";
        list += "<button data-mini='true' data-icon='delete' class='bold red' data-theme='b' id='delete-" + id + "'>" + _( "Delete" ) + " <span class='program-name'>" + program.name + "</span></button>";
    }

    // Take HTML string and convert to jQuery object
    page = $( list );

    // When controlgroup buttons are toggled change relevant options
    page.find( "input[name^='rad_days'],input[name^='stype']" ).on( "change", function() {
        var input = $( this ).val().split( "-" )[0].split( "_" );

        $( "[id^='input_" + input[0] + "_']" ).hide();
        $( "#input_" + input[0] + "_" + input[1] + "-" + id ).show();
    } );

    // Handle interval duration input
    page.find( "[id^='interval-']" ).on( "click", function() {
        var dur = $( this ),
            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text();

        showDurationBox( {
            seconds: dur.val(),
            title: name,
            callback: function( result ) {
                dur.val( result );
                dur.text( dhms2str( sec2dhms( result ) ) );
            },
            maximum: 86340,
            granularity: 1,
            preventCompression: true
        } );
    } );

    page.find( ".timefield" ).on( "click", function() {
        var time = $( this );

        showTimeInput( {
            minutes: time.val(),
            title: _( "Start Time" ),
            showSun: checkOSVersion( 213 ) ? true : false,
            callback: function( result ) {
                time.val( result );
                time.text( readStartTime( result ) );
            }
        } );
    } );

    // Handle repeat count button
    page.find( "[id^='repeat-']" ).on( "click", function() {
        var dur = $( this ),
            name = page.find( "label[for='" + dur.attr( "id" ) + "']" ).text();

        showSingleDurationInput( {
            data: dur.val(),
            title: name,
            label: _( "Repeat Count" ),
            callback: function( result ) {
                dur.val( result ).text( result );
            },
            maximum: 1440
        } );
    } );

    // Handle all station duration inputs
    page.find( "[id^=station_]" ).on( "click", function() {
        var dur = $( this ),
            name = controller.stations.snames[dur.attr( "id" ).split( "_" )[1].split( "-" )[0]];

        showDurationBox( {
            seconds: dur.val(),
            title: name,
            callback: function( result ) {
                dur.val( result ).addClass( "green" );
                dur.text( getDurationText( result ) );

                if ( result === 0 ) {
                    dur.removeClass( "green" );
                }
            },
            maximum: 65535,
            showSun: checkOSVersion( 214 ) ? true : false
        } );
    } );

    fixInputClick( page );

    return page;
}

function addProgram( copyID ) {
    copyID = ( copyID >= 0 ) ? copyID : "new";

    var page = $( "<div data-role='page' id='addprogram'>" +
                "<div class='ui-content' role='main' id='newprogram'>" +
                    "<fieldset id='program-new'>" +
                    "</fieldset>" +
                "</div>" +
            "</div>" ),
        submit = function() {
            submitProgram( "new" );
            return false;
        },
        header = changeHeader( {
            title: _( "Add Program" ),
            leftBtn: {
                icon: "carat-l",
                text: _( "Back" ),
                class: "ui-toolbar-back-btn",
                on: checkChangesBeforeBack
            },
            rightBtn: {
                icon: "check",
                text: _( "Submit" ),
                on: submit
            }
        } );

    page.find( "#program-new" ).html( makeProgram( copyID, true ) ).one( "change input", function() {
        header.eq( 2 ).prop( "disabled", false ).addClass( "hasChanges" );
    } );

    page.find( "[id^='submit-']" ).on( "click", function() {
        submitProgram( "new" );
        return false;
    } );

    page.one( "pagehide", function() {
        page.remove();
    } );

    if ( typeof copyID === "string" ) {
        header.eq( 2 ).prop( "disabled", true );
    }

    $( "#addprogram" ).remove();
    $.mobile.pageContainer.append( page );
}

function deleteProgram( id ) {
    areYouSure( _( "Are you sure you want to delete program" ) + " " + ( parseInt( id ) + 1 ) + "?", "", function() {
        $.mobile.loading( "show" );
        sendToOS( "/dp?pw=&pid=" + id ).done( function() {
            $.mobile.loading( "hide" );
            updateControllerPrograms( function() {
                $( "#programs" ).trigger( "programrefresh" );
                showerror( _( "Program" ) + " " + ( parseInt( id ) + 1 ) + " " + _( "deleted" ) );
            } );
        } );
    } );
}

function submitProgram( id ) {
    $( "#program-" + id ).find( ".hasChanges" ).removeClass( "hasChanges" );

    if ( checkOSVersion( 210 ) ) {
        submitProgram21( id );
    } else {
        submitProgram183( id );
    }
}

function submitProgram183( id ) {
    var program = [],
        days = [ 0, 0 ],
        stationSelected = 0,
        en = ( $( "#en-" + id ).is( ":checked" ) ) ? 1 : 0,
        daysin, i, s;

    program[0] = en;

    if ( $( "#days_week-" + id ).is( ":checked" ) ) {
        daysin = $( "#d-" + id ).val();
        daysin = ( daysin === null ) ? [] : parseIntArray( daysin );
        for ( i = 0; i < 7; i++ ) {if ( $.inArray( i, daysin ) !== -1 ) {days[0] |= ( 1 << i ); }}
        if ( days[0] === 0 ) {
            showerror( _( "Error: You have not selected any days of the week." ) );
            return;
        }
        if ( $( "#days_rst-" + id ).val() === "odd" ) {
			days[0] |= 0x80; days[1] = 1;
        } else if ( $( "#days_rst-" + id ).val() === "even" ) {
			days[0] |= 0x80; days[1] = 0;
        }
    } else if ( $( "#days_n-" + id ).is( ":checked" ) ) {
        days[1] = parseInt( $( "#every-" + id ).val(), 10 );
        if ( !( days[1] >= 2 && days[1] <= 128 ) ) {showerror( _( "Error: Interval days must be between 2 and 128." ) );return;}
        days[0] = parseInt( $( "#starting-" + id ).val(), 10 );
        if ( !( days[0] >= 0 && days[0] < days[1] ) ) {showerror( _( "Error: Starting in days wrong." ) );return;}
        days[0] |= 0x80;
    }
    program[1] = days[0];
    program[2] = days[1];

    program[3] = parseInt( $( "#start-" + id ).val() );
    program[4] = parseInt( $( "#end-" + id ).val() );

    if ( program[3] > program[4] ) {showerror( _( "Error: Start time must be prior to end time." ) );return;}

    program[5] = parseInt( $( "#interval-" + id ).val() / 60 );

    var sel = $( "[id^=station_][id$=-" + id + "]" ),
        total = sel.length,
        nboards = total / 8;

    program[6] = parseInt( $( "#duration-" + id ).val() );
    var stations = [ 0 ], bid, sid;
    for ( bid = 0; bid < nboards; bid++ ) {
        stations[bid] = 0;
        for ( s = 0; s < 8; s++ ) {
            sid = bid * 8 + s;
            if ( $( "#station_" + sid + "-" + id ).is( ":checked" ) ) {
                stations[bid] |= 1 << s; stationSelected = 1;
            }
        }
    }
    program = JSON.stringify( program.concat( stations ) );

    if ( stationSelected === 0 ) {showerror( _( "Error: You have not selected any stations." ) );return;}
    $.mobile.loading( "show" );
    if ( id === "new" ) {
        sendToOS( "/cp?pw=&pid=-1&v=" + program ).done( function() {
            $.mobile.loading( "hide" );
            updateControllerPrograms( function() {
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Program added successfully" ) );
                } );
                goBack();
            } );
        } );
    } else {
        sendToOS( "/cp?pw=&pid=" + id + "&v=" + program ).done( function() {
            $.mobile.loading( "hide" );
            updateControllerPrograms( function() {
                updateProgramHeader();
            } );
            showerror( _( "Program has been updated" ) );
        } );
    }
}

function submitProgram21( id, ignoreWarning ) {
    var program = [],
        days = [ 0, 0 ],
        start = [ 0, 0, 0, 0 ],
        stationSelected = 0,
        en = ( $( "#en-" + id ).is( ":checked" ) ) ? 1 : 0,
        weather = ( $( "#uwt-" + id ).is( ":checked" ) ) ? 1 : 0,
        j = 0,
        daysin, i, name, url;

    // Set enable/disable bit for program
    j |= ( en << 0 );

    // Set use weather flag
    j |= ( weather << 1 );

    // Set restriction flag
    if ( $( "#days_rst-" + id ).val() === "odd" ) {
        j |= ( 1 << 2 );
    } else if ( $( "#days_rst-" + id ).val() === "even" ) {
        j |= ( 2 << 2 );
    }

    // Set program type
    if ( $( "#days_n-" + id ).is( ":checked" ) ) {
        j |= ( 3 << 4 );
        days[1] = parseInt( $( "#every-" + id ).val(), 10 );

        if ( !( days[1] >= 2 && days[1] <= 128 ) ) {
			showerror( _( "Error: Interval days must be between 2 and 128." ) );
			return;
        }

        days[0] = parseInt( $( "#starting-" + id ).val(), 10 );

        if ( !( days[0] >= 0 && days[0] < days[1] ) ) {
			showerror( _( "Error: Starting in days wrong." ) );
			return;
        }

    } else if ( $( "#days_week-" + id ).is( ":checked" ) ) {
        j |= ( 0 << 4 );
        daysin = $( "#d-" + id ).val();
        daysin = ( daysin === null ) ? [] : parseIntArray( daysin );
        for ( i = 0; i < 7; i++ ) {
            if ( $.inArray( i, daysin ) !== -1 ) {
                days[0] |= ( 1 << i );
            }
        }
        if ( days[0] === 0 ) {
            showerror( _( "Error: You have not selected any days of the week." ) );
            return;
        }
    }

    // Set program start time type
    if ( $( "#stype_repeat-" + id ).is( ":checked" ) ) {
        j |= ( 0 << 6 );

        start[0] = parseInt( $( "#start_1-" + id ).val() );
        start[1] = parseInt( $( "#repeat-" + id ).val() );
        start[2] = parseInt( $( "#interval-" + id ).val() / 60 );
    } else if ( $( "#stype_set-" + id ).is( ":checked" ) ) {
        j |= ( 1 << 6 );
        var times = $( "[id^='start_'][id$='-" + id + "']" );

        times.each( function( a, b ) {
            var time = parseInt( b.value );

            if ( !time || ( a > 0 && !$( "#ust_" + ( a + 1 ) ).is( ":checked" ) ) ) {
                time = -1;
            }

            start[a] = time;
        } );
    }

    var sel = $( "[id^=station_][id$=-" + id + "]" ),
        runTimes = [];

    sel.each( function() {
        var dur = parseInt( this.value );
        if ( parseInt( dur ) > 0 ) {
            stationSelected = 1;
        }
        runTimes.push( dur );
    } );

    program[0] = j;
    program[1] = days[0];
    program[2] = days[1];
    program[3] = start;
    program[4] = runTimes;

    name = $( "#name-" + id ).val();
    url = "&v=" + JSON.stringify( program ) + "&name=" + encodeURIComponent( name );

    if ( stationSelected === 0 ) {
        showerror( _( "Error: You have not selected any stations." ) );
        return;
    }

    if ( !ignoreWarning && $( "#stype_repeat-" + id ).is( ":checked" ) && start[1] > 0 && calculateTotalRunningTime( runTimes ) > start[2] * 60 ) {
        areYouSure( _( "Warning: The repeat interval is less than the program run time." ), _( "Do you want to continue?" ), function() {
            submitProgram21( id, true );
        } );

        return;
    }

    // If the interval is an even number and a restriction is set, notify user of possible conflict
    if ( !ignoreWarning && ( ( j >> 4 ) & 0x03 ) === 3 && !( days[1] & 1 ) && ( ( j >> 2 ) & 0x03 ) > 0 ) {
        areYouSure( _( "Warning: The use of odd/even restrictions with the selected interval day may result in the program not running at all." ), _( "Do you want to continue?" ), function() {
            submitProgram21( id, true );
        } );
        return;
    }

    $.mobile.loading( "show" );
    if ( id === "new" ) {
        sendToOS( "/cp?pw=&pid=-1" + url ).done( function() {
            $.mobile.loading( "hide" );
            updateControllerPrograms( function() {
                $.mobile.document.one( "pageshow", function() {
                    showerror( _( "Program added successfully" ) );
                } );
                goBack();
            } );
        } );
    } else {
        sendToOS( "/cp?pw=&pid=" + id + url ).done( function() {
            $.mobile.loading( "hide" );
            updateControllerPrograms( function() {
                updateProgramHeader();
                $( "#program-" + id ).find( ".program-name" ).text( name );
            } );
            showerror( _( "Program has been updated" ) );
        } );
    }
}

function raindelay( delay ) {
    $.mobile.loading( "show" );
    sendToOS( "/cv?pw=&rd=" + ( delay / 3600 ) ).done( function() {
        $.mobile.loading( "hide" );
        showLoading( "#footer-running" );
        refreshStatus();
        showerror( _( "Rain delay has been successfully set" ) );
    } );
    return false;
}

// Export and Import functions
function getExportMethod() {
    var popup = $(
        "<div data-role='popup' data-theme='a'>" +
            "<div class='ui-bar ui-bar-a'>" + _( "Select Export Method" ) + "</div>" +
            "<div data-role='controlgroup' class='tight'>" +
                "<a class='ui-btn hidden fileMethod'>" + _( "File" ) + "</a>" +
                "<a class='ui-btn pasteMethod'>" + _( "Email" ) + "</a>" +
                "<a class='ui-btn localMethod'>" + _( "Internal (within app)" ) + "</a>" +
            "</div>" +
        "</div>" ),
        obj = encodeURIComponent( JSON.stringify( controller ) ),
        subject = "OpenSprinkler Data Export on " + dateToString( new Date() );

    if ( isFileCapable ) {
        popup.find( ".fileMethod" ).removeClass( "hidden" ).attr( {
            href: "data:text/json;charset=utf-8," + obj,
            download: "backup.json"
        } ).on( "click", function() {
            popup.popup( "close" );
        } );
    }

    var href = "mailto:?subject=" + encodeURIComponent( subject ) + "&body=" + obj;
    popup.find( ".pasteMethod" ).attr( "href", href ).on( "click", function() {
        window.open( href );
        popup.popup( "close" );
    } );

    popup.find( ".localMethod" ).on( "click", function() {
        popup.popup( "close" );
        storage.set( { "backup":JSON.stringify( controller ) }, function() {
            showerror( _( "Backup saved on this device" ) );
        } );
    } );

    openPopup( popup, { positionTo: $( "#sprinklers-settings" ).find( ".export_config" ) } );
}

function getImportMethod( localData ) {
    var getPaste = function() {
            var popup = $(
                    "<div data-role='popup' data-theme='a' id='paste_config'>" +
                        "<p class='ui-bar'>" +
                            "<textarea class='textarea' rows='10' placeholder='" + _( "Paste your backup here" ) + "'></textarea>" +
                            "<button data-mini='true' data-theme='b'>" + _( "Import" ) + "</button>" +
                        "</p>" +
                    "</div>"
                ),
                width = $.mobile.window.width();

            popup.find( "button" ).on( "click", function() {
                var data = popup.find( "textarea" ).val();

                if ( data === "" ) {
                    return;
                }

                try {
                    data = JSON.parse( $.trim( data ).replace( /“|”|″/g, "\"" ) );
                    popup.popup( "close" );
                    importConfig( data );
                }catch ( err ) {
                    popup.find( "textarea" ).val( "" );
                    showerror( _( "Unable to read the configuration file. Please check the file and try again." ) );
                }
            } );

            popup.css( "width", ( width > 600 ? width * 0.4 + "px" : "100%" ) );
            openPopup( popup );
            return false;
        },
        popup = $(
            "<div data-role='popup' data-theme='a'>" +
                "<div class='ui-bar ui-bar-a'>" + _( "Select Import Method" ) + "</div>" +
                "<div data-role='controlgroup' class='tight'>" +
                    "<button class='hidden fileMethod'>" + _( "File" ) + "</button>" +
                    "<button class='pasteMethod'>" + _( "Email (copy/paste)" ) + "</button>" +
                    "<button class='hidden localMethod'>" + _( "Internal (within app)" ) + "</button>" +
                "</div>" +
            "</div>" );

    if ( isFileCapable ) {
        popup.find( ".fileMethod" ).removeClass( "hidden" ).on( "click", function() {
            popup.popup( "close" );
            var input = $( "<input type='file' id='configInput' data-role='none' style='visibility:hidden;position:absolute;top:-50px;left:-50px'/>" )
				.on( "change", function() {
                    var config = this.files[0],
                        reader = new FileReader();

                    if ( typeof config !== "object" ) {
                        return;
                    }

                    reader.onload = function( e ) {
                        try {
                            var obj = JSON.parse( $.trim( e.target.result ) );
                            importConfig( obj );
                        }catch ( err ) {
                            showerror( _( "Unable to read the configuration file. Please check the file and try again." ) );
                        }
                    };

                    reader.readAsText( config );
                } );

            input.appendTo( "#sprinklers-settings" );
            input.click();
            return false;
        } );
    } else {

        // Handle local storage being unavailable and present paste dialog immediately
        if ( !localData ) {
            getPaste();
            return;
        }
    }

    popup.find( ".pasteMethod" ).on( "click", function() {
        popup.popup( "close" );
        getPaste();
        return false;
    } );

    if ( localData ) {
        popup.find( ".localMethod" ).removeClass( "hidden" ).on( "click", function() {
            popup.popup( "close" );
            importConfig( JSON.parse( localData ) );
            return false;
        } );
    }

    openPopup( popup, { positionTo: $( "#sprinklers-settings" ).find( ".import_config" ) } );
}

function importConfig( data ) {
    var piNames = { 1:"tz", 2:"ntp", 12:"htp", 13:"htp2", 14:"ar", 15:"nbrd", 16:"seq", 17:"sdt", 18:"mas", 19:"mton", 20:"mtoff",
			21:"urs", 22:"rst", 23:"wl", 25:"ipas", 30:"rlp", 36:"lg" },
        keyIndex = { "tz":1, "ntp":2, "dhcp":3, "hp0":12, "hp1":13, "ar":14, "ext":15, "seq":16, "sdt":17, "mas":18, "mton":19,
			"mtof":20, "urs":21, "rso":22, "wl":23, "ipas":25, "devid":26, "con": 27, "lit": 28, "dim": 29, "rlp":30, "lg":36,
			"uwt":31, "ntp1":32, "ntp2":33, "ntp3":34, "ntp4":35, "mas2":37, "mton2":38, "mtof2":39 },
        warning = "";

    if ( typeof data !== "object" || !data.settings ) {
        showerror( _( "Invalid configuration" ) );
        return;
    }

    if ( checkOSVersion( 210 ) && typeof data.options === "object" &&
		( data.options.hp0 !== controller.options.hp0 || data.options.hp1 !== controller.options.hp1 ) ||
		( data.options.dhcp !== controller.options.dhcp ) || ( data.options.devid !== controller.options.devid ) ) {

        warning = _( "Warning: Network changes will be made and the device may no longer be accessible from this address." );
    }

    areYouSure( _( "Are you sure you want to restore the configuration?" ), warning, function() {
        $.mobile.loading( "show" );

        var cs = "/cs?pw=",
            co = "/co?pw=",
            cpStart = "/cp?pw=",
            isPi = isOSPi(),
            i, key, option, station;

        for ( i in data.options ) {
            if ( data.options.hasOwnProperty( i ) && keyIndex.hasOwnProperty( i ) ) {
                key = keyIndex[i];
                if ( $.inArray( key, [ 2, 14, 16, 21, 22, 25, 36 ] ) !== -1 && data.options[i] === 0 ) {
                    continue;
                }
                if ( key === 3 ) {
                    if ( checkOSVersion( 210 ) && controller.options.dhcp === 1 ) {
                        co += "&o3=1";
                    }
                    continue;
                }
                if ( isPi ) {
                    key = piNames[key];
                    if ( key === undefined ) {
                        continue;
                    }
                } else {
                    key = key;
                }
                if ( checkOSVersion( 208 ) === true && typeof data.options[i] === "string" ) {
                    option = data.options[i].replace( /\s/g, "_" );
                } else {
                    option = data.options[i];
                }
                co += "&o" + key + "=" + option;
            }
        }

        // Import WUnderground API key, if available
        if ( data.settings.hasOwnProperty( "wtkey" ) && data.settings.wtkey !== "" && checkOSVersion( 210 ) ) {
            co += "&wtkey=" + data.settings.wtkey;
        }

        // Handle import from versions prior to 2.1.1 for enable logging flag
        if ( !isPi && typeof data.options.fwv === "number" && data.options.fwv < 211 && checkOSVersion( 211 ) ) {

            // Enables logging since prior firmwares always had logging enabled
            co += "&o36=1";
        }

        co += "&" + ( isPi ? "o" : "" ) + "loc=" + data.settings.loc;

        for ( i = 0; i < data.stations.snames.length; i++ ) {
            if ( checkOSVersion( 208 ) === true ) {
                station = data.stations.snames[i].replace( /\s/g, "_" );
            } else {
                station = data.stations.snames[i];
            }
            cs += "&s" + i + "=" + station;
        }

        for ( i = 0; i < data.stations.masop.length; i++ ) {
            cs += "&m" + i + "=" + data.stations.masop[i];
        }

        if ( typeof data.stations.masop2 === "object" ) {
            for ( i = 0; i < data.stations.masop2.length; i++ ) {
                cs += "&n" + i + "=" + data.stations.masop2[i];
            }
        }

        if ( typeof data.stations.ignore_rain === "object" ) {
            for ( i = 0; i < data.stations.ignore_rain.length; i++ ) {
                cs += "&i" + i + "=" + data.stations.ignore_rain[i];
            }
        }

        if ( typeof data.stations.stn_dis === "object" ) {
            for ( i = 0; i < data.stations.stn_dis.length; i++ ) {
                cs += "&d" + i + "=" + data.stations.stn_dis[i];
            }
        }

        if ( typeof data.stations.stn_seq === "object" ) {
            for ( i = 0; i < data.stations.stn_seq.length; i++ ) {
                cs += "&q" + i + "=" + data.stations.stn_seq[i];
            }
        } else if ( !isPi && typeof data.options.fwv === "number" && data.options.fwv < 211 && !checkOSVersion( 211 ) ) {
            var bid;
            for ( bid = 0; bid < data.settings.nbrd; bid++ ) {
                cs += "&q" + bid + "=" + ( data.options.seq === 1 ? 255 : 0 );
            }
        }

        if ( typeof data.stations.act_relay === "object" ) {
            for ( i = 0; i < data.stations.act_relay.length; i++ ) {
                cs += "&a" + i + "=" + data.stations.act_relay[i];
            }
        }

        $.when(
            sendToOS( co ),
            sendToOS( cs ),
            sendToOS( "/dp?pw=&pid=-1" ),
            $.each( data.programs.pd, function( i, prog ) {
                var name = "";

                // Handle data from firmware 2.1+ being imported to OSPi
                if ( isPi && typeof data.options.fwv === "number" && data.options.fwv >= 210 ) {
                    showerror( _( "Program data is newer than the device firmware and cannot be imported" ) );
                    return false;
                }

                // Handle data from firmware 2.1+ being imported to a firmware prior to 2.1
                if ( !isPi && typeof data.options.fwv === "number" && data.options.fwv >= 210 && !checkOSVersion( 210 ) ) {
                    showerror( _( "Program data is newer than the device firmware and cannot be imported" ) );
                    return false;
                }

                // Handle data from firmware 2.1+ being imported to a 2.1+ device
                // The firmware does not accept program name inside the program array and must be submitted seperately
                if ( !isPi && typeof data.options.fwv === "number" && data.options.fwv >= 210 && checkOSVersion( 210 ) ) {
                    name = "&name=" + prog[5];

                    // Truncate the program name off the array
                    prog = prog.slice( 0, 5 );
                }

                // Handle data from firmware prior to 2.1 being imported to a 2.1+ device
                if ( !isPi && typeof data.options.fwv === "number" && data.options.fwv < 210 && checkOSVersion( 210 ) ) {
                    var program = readProgram183( prog ),
                        total = ( prog.length - 7 ),
                        allDur = [],
                        j = 0,
                        bits, n, s;

                    // Set enable/disable bit for program
                    j |= ( program.en << 0 );

                    // Set program restrictions
                    if ( program.is_even ) {
                        j |= ( 2 << 2 );
                    } else if ( program.is_odd ) {
                        j |= ( 1 << 2 );
                    } else {
                        j |= ( 0 << 2 );
                    }

                    // Set program type
                    if ( program.is_interval ) {
                        j |= ( 3 << 4 );
                    } else {
                        j |= ( 0 << 4 );
                    }

                    // Set start time type (repeating)
                    j |= ( 0 << 6 );

                    // Save bits to program data
                    prog[0] = j;

                    // Using the total number of stations, migrate the duration into each station
                    for ( n = 0; n < total; n++ ) {
                        bits = prog[7 + n];
                        for ( s = 0; s < 8; s++ ) {
                            allDur.push( ( bits & ( 1 << s ) ) ? program.duration : 0 );
                        }
                    }

                    // Set the start time, interval time, and repeat count
                    prog[3] = [ program.start, parseInt( ( program.end - program.start ) / program.interval ), program.interval, 0 ];

                    // Change the duration from the previous int to the new array
                    prog[4] = allDur;

                    // Truncate the station enable/disable flags
                    prog = prog.slice( 0, 5 );

                    name = "&name=" + _( "Program" ) + " " + ( i + 1 );
                }

                sendToOS( cpStart + "&pid=-1&v=" + JSON.stringify( prog ) + name );
            } )
        ).then(
            function() {
				setTimeout( function() {
	                updateController(
	                    function() {
	                        $.mobile.loading( "hide" );
	                        showerror( _( "Backup restored to your device" ) );
	                        updateWeather();
	                        goHome( true );
	                    },
	                    function() {
	                        $.mobile.loading( "hide" );
	                        networkFail();
	                    }
	                );
				}, 1500 );
            },
            function() {
                $.mobile.loading( "hide" );
                showerror( _( "Unable to import configuration." ) );
            }
        );
    } );
}

// About page
var showAbout = ( function() {

    var page = $( "<div data-role='page' id='about'>" +
            "<div class='ui-content' role='main'>" +
                "<ul data-role='listview' data-inset='true'>" +
                    "<li>" +
                        "<p>" + _( "User manual for OpenSprinkler is available at" ) +
							" <a class='iab' target='_blank' href='https://opensprinkler.freshdesk.com/support/solutions/folders/5000147083'>" +
								"https://support.opensprinkler.com" +
							"</a>" +
						"</p>" +
                    "</li>" +
                "</ul>" +
                "<ul data-role='listview' data-inset='true'>" +
                    "<li>" +
                        "<p>" + _( "This is open source software: source code and changelog for this application can be found at" ) + " " +
							"<a class='iab squeeze' target='_blank' href='https://github.com/OpenSprinkler/OpenSprinkler-App/'>" +
								"https://github.com/OpenSprinkler/OpenSprinkler-App/" +
							"</a>" +
						"</p>" +
                        "<p>" + _( "Language localization is crowdsourced using Get Localization available at" ) + " " +
							"<a class='iab squeeze' target='_blank' href='http://www.getlocalization.com/OpenSprinkler/'>" +
								"http://www.getlocalization.com/OpenSprinkler/" +
							"</a>" +
						"</p>" +
                        "<p>" + _( "Open source attributions" ) + ": " +
							"<a class='iab iabNoScale squeeze' target='_blank' " +
								"href='https://github.com/OpenSprinkler/OpenSprinkler-App/wiki/List-of-Integrated-Libraries'>" +
									"https://github.com/OpenSprinkler/OpenSprinkler-App/wiki/List-of-Integrated-Libraries" +
							"</a>" +
						"</p>" +
                    "</li>" +
                "</ul>" +
                "<p class='smaller'>" +
                    _( "App Version" ) + ": 1.4.5" +
                    "<br>" + _( "Firmware" ) + ": <span class='firmware'></span>" +
                    "<br><span class='hardwareLabel'>" + _( "Hardware Version" ) + ":</span> <span class='hardware'></span>" +
                "</p>" +
            "</div>" +
        "</div>" ),
		showHardware;

	function begin() {
		showHardware = typeof controller.options.hwv !== "undefined" ? false : true;
		page.find( ".hardware" ).toggleClass( "hidden", showHardware ).text( getHWVersion() + getHWType() );
		page.find( ".hardwareLabel" ).toggleClass( "hidden", showHardware );

		page.find( ".firmware" ).text( getOSVersion() + getOSMinorVersion() );

	    page.one( "pagehide", function() {
	        page.detach();
	    } );

	    changeHeader( {
	        title: _( "About" ),
	        leftBtn: {
	            icon: "carat-l",
	            text: _( "Back" ),
	            class: "ui-toolbar-back-btn",
	            on: goBack
	        }
	    } );

	    $( "#about" ).remove();
	    $.mobile.pageContainer.append( page );
	}

	return begin;
} )();

// OpenSprinkler controller methods
function isRunning() {
    for ( var i = 0; i < controller.status.length; i++ ) {
        if ( controller.status[i] > 0 && controller.settings.ps[i][0] > 0 ) {
            return i;
        }
    }

    return -1;
}

function stopStations( callback ) {
    $.mobile.loading( "show" );

    // It can take up to a second before stations actually stop
    sendToOS( "/cv?pw=&rsn=1" ).done( function() {
        setTimeout( function() {
            $.mobile.loading( "hide" );
            callback();
        }, 1000 );
    } );
}

// OpenSprinkler feature detection functions
function isOSPi() {
    if ( controller &&
		typeof controller.options === "object" &&
		typeof controller.options.fwv === "string" &&
		controller.options.fwv.search( /ospi/i ) !== -1 ) {

        return true;
    }
    return false;
}

// Check if password is valid
function checkPW( pass, callback ) {
    $.ajax( {
        url: currPrefix + currIp + "/sp?pw=" + encodeURIComponent( pass ) + "&npw=" + encodeURIComponent( pass ) + "&cpw=" + encodeURIComponent( pass ),
        cache: false,
        crossDomain: true,
        type: "GET"
    } ).then(
        function( data ) {
            var result = data.result;

            if ( typeof result === "undefined" || result > 1 ) {
                callback( false );
            } else {
                callback( true );
            }
        },
        function() {
            callback( false );
        }
    );
}

// Device password management functions
function changePassword( opt ) {
    var defaults = {
            fixIncorrect: false,
            name: "",
            callback: function() {},
            cancel: function() {}
        };

    opt = $.extend( {}, defaults, opt );

    var isPi = isOSPi(),
        didSubmit = false,
        popup = $( "<div data-role='popup' class='modal' id='changePassword' data-theme='a' data-overlay-theme='b'>" +
                "<ul data-role='listview' data-inset='true'>" +
                    ( opt.fixIncorrect === true ? "" : "<li data-role='list-divider'>" + _( "Change Password" ) + "</li>" ) +
                    "<li>" +
                        ( opt.fixIncorrect === true ? "<p class='rain-desc red-text bold'>" + _( "Incorrect password for " ) +
							opt.name + ". " + _( "Please re-enter password to try again." ) + "</p>" : "" ) +
                        "<form method='post' novalidate>" +
                            "<label for='npw'>" + ( opt.fixIncorrect === true ? _( "Password:" ) : _( "New Password" ) + ":" ) + "</label>" +
                            "<input type='password' name='npw' id='npw' value=''" + ( isPi ? "" : " maxlength='32'" ) + ">" +
                            ( opt.fixIncorrect === true ? "" : "<label for='cpw'>" + _( "Confirm New Password" ) + ":</label>" +
                            "<input type='password' name='cpw' id='cpw' value=''" + ( isPi ? "" : " maxlength='32'" ) + ">" ) +
                            ( opt.fixIncorrect === true ? "<label for='save_pw'>" + _( "Save Password" ) + "</label>" +
                            "<input type='checkbox' data-wrapper-class='save_pw' name='save_pw' id='save_pw' data-mini='true'>" : "" ) +
                            "<input type='submit' value='" + _( "Submit" ) + "'>" +
                        "</form>" +
                    "</li>" +
                "</ul>" +
        "</div>" );

    popup.find( "form" ).on( "submit", function() {
        var npw = popup.find( "#npw" ).val(),
            cpw = popup.find( "#cpw" ).val();

        if ( opt.fixIncorrect === true ) {
            didSubmit = true;

            storage.get( [ "sites" ], function( data ) {
                var sites = parseSites( data.sites ),
                    success = function( pass ) {
                        currPass = pass;
                        sites[opt.name].os_pw = popup.find( "#save_pw" ).is( ":checked" ) ? pass : "";
                        storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
                        popup.popup( "close" );
                        opt.callback();
                    };

                checkPW( md5( npw ), function( result ) {
                    if ( result === true ) {
                        success( md5( npw ) );
                    } else {
                        success( npw );
                    }
                } );
            } );

            return false;
        }

        if ( npw !== cpw ) {
            showerror( _( "The passwords don't match. Please try again." ) );
            return false;
        }

        if ( npw === "" ) {
            showerror( _( "Password cannot be empty" ) );
            return false;
        }

        if ( !isPi && npw.length > 32 ) {
            showerror( _( "Password cannot be longer than 32 characters" ) );
        }

        if ( checkOSVersion( 213 ) ) {
            npw = md5( npw );
            cpw = md5( cpw );
        }

        $.mobile.loading( "show" );
        sendToOS( "/sp?pw=&npw=" + encodeURIComponent( npw ) + "&cpw=" + encodeURIComponent( cpw ), "json" ).done( function( info ) {
            var result = info.result;

            if ( !result || result > 1 ) {
                if ( result === 2 ) {
                    showerror( _( "Please check the current device password is correct then try again" ) );
                } else {
                    showerror( _( "Unable to change password. Please try again." ) );
                }
            } else {
                storage.get( [ "sites", "current_site" ], function( data ) {
                    var sites = parseSites( data.sites );

                    sites[data.current_site].os_pw = npw;
                    currPass = npw;
                    storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
                } );
                $.mobile.loading( "hide" );
                popup.popup( "close" );
                showerror( _( "Password changed successfully" ) );
            }
        } );

        return false;
    } );

    popup.one( "popupafterclose", function() {
        document.activeElement.blur();
        popup.remove();
        if ( opt.fixIncorrect && !didSubmit ) {
            opt.cancel();
        }
    } ).popup().enhanceWithin();

    if ( opt.fixIncorrect ) {

        // hash password and try again, if failed then show the popup
        storage.get( [ "sites", "current_site" ], function( data ) {
            var sites = parseSites( data.sites ),
                current = data.current_site,
                pw = md5( sites[current].os_pw );

            if ( !isMD5( sites[current].os_pw ) ) {
                $.ajax( {
                    url: currPrefix + currIp + "/jc?pw=" + pw,
                    type: "GET",
                    dataType: "json"
                } ).then(
                    function() {
                        sites[current].os_pw = currPass = pw;
                        storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
                        opt.callback();
                    },
                    function() {
                        popup.popup( "open" );
                    }
                );
            } else {
                popup.popup( "open" );
            }
        } );
    } else {
        popup.popup( "open" );
    }
}

function requestCloudAuth( callback ) {
    callback = callback || function() {};

    var popup = $( "<div data-role='popup' class='modal' id='requestCloudAuth' data-theme='a'>" +
                "<ul data-role='listview' data-inset='true'>" +
                    "<li data-role='list-divider'>" + _( "OpenSprinkler.com Login" ) + "</li>" +
                    "<li><p class='rain-desc tight'>" +
                        _( "Use your OpenSprinkler.com login and password to securely sync sites between all your devices." ) +
                        "<br><br>" +
                        _( "Don't have an account?" ) + " <a href='https://opensprinkler.com/wp-login.php?action=register' class='iab'>" +
						_( "Register here" ) + "</a>" +
                    "</p></li>" +
                    "<li>" +
                        "<form method='post' novalidate>" +
                            "<label for='cloudUser'>" + _( "Username:" ) + "</label>" +
                            "<input type='text' name='cloudUser' id='cloudUser' autocomplete='off' autocorrect='off' autocapitalize='off' " +
								"spellcheck='false'>" +
                            "<label for='cloudPass'>" + _( "Password:" ) + "</label>" +
                            "<input type='password' name='cloudPass' id='cloudPass'>" +
                            "<input type='submit' value='" + _( "Submit" ) + "'>" +
                        "</form>" +
                    "</li>" +
                "</ul>" +
        "</div>" ),
        didSucceed = false;

    popup.find( "form" ).on( "submit", function() {
        $.mobile.loading( "show" );
        cloudLogin( popup.find( "#cloudUser" ).val(), popup.find( "#cloudPass" ).val(), function( result ) {
            if ( result === false ) {
                showerror( _( "Invalid username/password combination. Please try again." ) );
                return;
            } else {
                $.mobile.loading( "hide" );
                didSucceed = true;
                popup.popup( "close" );
            }
        } );
        return false;
    } );

    popup.one( "popupafterclose", function() {
        callback( didSucceed );
        if ( didSucceed ) {
            cloudSyncStart();
        }
    } );

    openPopup( popup );
}

function cloudLogin( user, pass, callback ) {
    callback = callback || function() {};

    $.ajax( {
        type: "POST",
        dataType: "json",
        url: "https://opensprinkler.com/wp-admin/admin-ajax.php",
        data: {
            action: "ajaxLogin",
            username: user,
            password: pass
        },
        success: function( data ) {
            if ( typeof data.token === "string" ) {
                storage.set( {
                    "cloudToken": data.token,
                    "cloudDataToken": sjcl.codec.hex.fromBits( sjcl.hash.sha256.hash( pass ) )
                } );
            }
            callback( data.loggedin );
        },
        fail: function() {
            callback( false );
        }
    } );
}

function cloudSaveSites( callback ) {
    if ( typeof callback !== "function" ) {
        callback = function() {};
    }

    storage.get( [ "cloudToken", "cloudDataToken", "sites" ], function( data ) {
        if ( data.cloudToken === null || data.cloudToken === undefined ) {
            callback( false );
            return;
        }

        $.ajax( {
            type: "POST",
            dataType: "json",
            url: "https://opensprinkler.com/wp-admin/admin-ajax.php",
            data: {
                action: "saveSites",
                token: data.cloudToken,
                sites: encodeURIComponent( JSON.stringify( sjcl.encrypt( data.cloudDataToken, data.sites ) ) )
            },
            success: function( data ) {
                if ( data.success === false ) {
                    if ( data.message === "BAD_TOKEN" ) {
                        handleExpiredLogin();
                    }
                    callback( false, data.message );
                } else {
                    storage.set( { "cloudToken":data.token } );
                    callback( data.success );
                }
            },
            fail: function() {
                callback( false );
            }
        } );
    } );
}

function cloudGetSites( callback ) {
    callback = callback || function() {};

    storage.get( [ "cloudToken", "cloudDataToken" ], function( local ) {
        if ( local.cloudToken === undefined || local.cloudToken === null ) {
            callback( false );
            return;
        }

        if ( local.cloudDataToken === undefined || local.cloudDataToken === null ) {
            handleInvalidDataToken();
            callback( false );
            return;
        }

        $.ajax( {
            type: "POST",
            dataType: "json",
            url: "https://opensprinkler.com/wp-admin/admin-ajax.php",
            data: {
                action: "getSites",
                token: local.cloudToken
            },
            success: function( data ) {
                if ( data.success === false || data.sites === "" ) {
                    if ( data.message === "BAD_TOKEN" ) {
                        handleExpiredLogin();
                    }
                    callback( false, data.message );
                } else {
                    storage.set( { "cloudToken":data.token } );
                    var sites;

                    try {
                        sites = sjcl.decrypt( local.cloudDataToken, data.sites );
                    } catch ( err ) {
                        if ( err.message === "ccm: tag doesn't match" ) {
                            handleInvalidDataToken();
                        }
                        callback( false );
                    }

                    try {
                        callback( JSON.parse( sites ) );
                    } catch ( err ) {
                        callback( false );
                    }
                }
            },
            fail: function() {
                callback( false );
            }
        } );
    } );
}

function cloudSyncStart() {
    cloudGetSites( function( sites ) {
        var page = $( ".ui-page-active" ).attr( "id" );

        if ( page === "start" ) {
            if ( Object.keys( sites ).length > 0 ) {
                storage.set( { "sites":JSON.stringify( sites ) } );
            }
            changePage( "#site-control" );
        } else {
            updateLoginButtons();

            storage.get( "sites", function( data ) {
                if ( JSON.stringify( sites ) === data.sites ) {
                    return;
                }

                data.sites = parseSites( data.sites );

                if ( Object.keys( sites ).length > 0 ) {

                    // Handle how to merge when cloud is populated
                    var popup = $(
                        "<div data-role='popup' data-theme='a' data-overlay-theme='b'>" +
                            "<div class='ui-bar ui-bar-a'>" + _( "Select Merge Method" ) + "</div>" +
                            "<div data-role='controlgroup' class='tight'>" +
                                "<button class='merge'>" + _( "Merge" ) + "</button>" +
                                "<button class='replaceLocal'>" + _( "Replace local with cloud" ) + "</button>" +
                                "<button class='replaceCloud'>" + _( "Replace cloud with local" ) + "</button>" +
                            "</div>" +
                        "</div>" ),
                        finish = function() {
                            storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
                            popup.popup( "close" );

                            if ( page === "site-control" ) {
                                changePage( "#site-control" );
                            }
                        };

                    popup.find( ".merge" ).on( "click", function() {
                        sites = $.extend( {}, data.sites, sites );
                        finish();
                    } );

                    popup.find( ".replaceLocal" ).on( "click", function() {
                        finish();
                    } );

                    popup.find( ".replaceCloud" ).on( "click", function() {
                        sites = data.sites;
                        finish();
                    } );

                    popup.one( "popupafterclose", function() {
                        popup.popup( "destroy" ).remove();
                    } ).popup( {
                        history: false,
                        "positionTo": "window"
                    } ).enhanceWithin().popup( "open" );
                } else {
                    cloudSaveSites();
                }
            } );
        }
    } );
}

function cloudSync( callback ) {
    if ( typeof callback !== "function" ) {
        callback = function() {};
    }

    storage.get( [ "cloudToken", "current_site" ], function( local ) {
        if ( typeof local.cloudToken !== "string" ) {
            return;
        }

        cloudGetSites( function( data ) {
            if ( data !== false ) {
                storage.set( { "sites":JSON.stringify( data ) }, function() {
                    updateSiteList( Object.keys( data ), local.current_site );
                    callback();

                    $( "html" ).trigger( "siterefresh" );
                } );
            }
        } );
    } );
}

function handleExpiredLogin() {
    storage.remove( [ "cloudToken" ], updateLoginButtons );

    addNotification( {
        title: _( "OpenSprinkler.com Login Expired" ),
        desc: _( "Click here to re-login to OpenSprinkler.com" ),
        on: function() {
            var button = $( this ).parent();

            requestCloudAuth( function( result ) {
                removeNotification( button );

                if ( result === true ) {
                    updateLoginButtons();
                    cloudSync();
                }
            } );

            return false;
        }
    } );
}

function handleInvalidDataToken() {
    storage.remove( [ "cloudDataToken" ] );

    addNotification( {
        title: _( "Unable to read cloud data" ),
        desc: _( "Click here to enter a valid password to decrypt the data" ),
        on: function() {
            var button = $( this ).parent(),
                popup = $(
                    "<div data-role='popup' data-theme='a' class='modal ui-content' id='dataPassword'>" +
                        "<p class='tight rain-desc'>" +
							_( "Please enter your OpenSprinkler.com password. If you have recently changed your password, you may need to enter your previous password to decrypt the data." ) +
						"</p>" +
                        "<form>" +
                            "<input type='password' id='dataPasswordInput' name='dataPasswordInput' placeholder='" + _( "Password" ) + "' />" +
                            "<input type='submit' data-theme='b' value='" + _( "Submit" ) + "' />" +
                        "</form>" +
                    "</div>"
                ),
                didSubmit = false;

            //Bind submit
            popup.find( "form" ).on( "submit", function() {
                removeNotification( button );
                didSubmit = true;
                storage.set( {
                    "cloudDataToken": sjcl.codec.hex.fromBits( sjcl.hash.sha256.hash( popup.find( "#dataPasswordInput" ).val() ) )
                }, function() {
                    popup.popup( "close" );
                } );

                return false;
            } );

            popup.one( "popupafterclose", function() {
                if ( didSubmit === true ) {
                    cloudSync();
                }
            } );

            openPopup( popup );
            return false;
        }
    } );
}

function getTokenUser( token ) {
    return atob( token ).split( "|" )[0];
}

function checkWeatherPlugin() {
    var weatherSettings = $( ".weather_settings" ),
        weatherProvider = $( ".show-providers" );

    currPiWeather = [];
    weatherSettings.hide();
    if ( isOSPi() ) {
        storage.get( "provider", function( data ) {
            sendToOS( "/wj?pw=", "json" ).done( function( results ) {
                var provider = results.weather_provider;

                // Check if the OSPi has valid weather provider data
                if ( typeof provider === "string" && ( provider === "yahoo" || provider === "wunderground" ) ) {
                    if ( data.provider !== provider ) {
                        storage.set( {
                            "provider": provider,
                            "wapikey": results.wapikey
                        } );

                        // Update the weather based on this information
                        updateWeather();
                    }

                    // Hide the weather provider option when the OSPi provides it
                    weatherProvider.hide();
                }

                if ( typeof results.auto_delay === "string" ) {
                    currPiWeather = results;
                    weatherSettings.css( "display", "" );
                }
            } );
        } );
    } else {
        if ( checkOSVersion( 210 ) ) {

            // Hide the weather provider option when the OSPi provides it
            weatherProvider.hide();
        } else {
            weatherProvider.css( "display", "" );
        }
    }
}

function showUnifiedFirmwareNotification() {
	if ( !isOSPi() ) {
		return;
	}

    storage.get( "ignoreUnifiedFirmware", function( data ) {
        if ( data.ignoreUnifiedFirmware !== "1" ) {

		    // Unable to access the device using it's public IP
		    addNotification( {
		        title: _( "Unified firmware is now avaialble" ),
		        desc: _( "Click here for more details" ),
		        on: function() {
		            var iab = window.open( "https://opensprinkler.freshdesk.com/support/solutions/articles/5000631599",
						"_blank", "location=" + ( isAndroid ? "yes" : "no" ) +
						",enableViewportScale=yes,toolbarposition=top,closebuttoncaption=" + _( "Back" ) );

		            if ( isIEMobile ) {
		                $.mobile.document.data( "iabOpen", true );
		                iab.addEventListener( "exit", function() {
		                    $.mobile.document.removeData( "iabOpen" );
		                } );
		            }

		            return false;
		        },
		        off: function() {
		            storage.set( { "ignoreUnifiedFirmware": "1" } );
		            return true;
		        }
		    } );
		}
	} );
}

function intToIP( eip ) {
    return ( ( eip >> 24 ) & 255 ) + "." + ( ( eip >> 16 ) & 255 ) + "." + ( ( eip >> 8 ) & 255 ) + "." + ( eip & 255 );
}

function checkPublicAccess( eip ) {

    // Check if the device is accessible from it's public IP

    if ( eip === 0 ) {
        return;
    }

    var ip = intToIP( eip ),
        port = currIp.match( /.*:(\d+)/ );

    if ( ip === currIp || isLocalIP( ip ) || !isLocalIP( currIp ) ) {
        return;
    }

    port = ( port ? parseInt( port[1] ) : 80 );

    $.ajax( {
        url: currPrefix + ip + ":" + port + "/jo?pw=" + currPass,
        global: false,
        dataType: "json",
        type: "GET"
    } ).then(
        function( data ) {
            if ( typeof data !== "object" || !data.hasOwnProperty( "fwv" ) ) {
                return;
            }

            // Public IP worked, update device IP to use the public IP instead
            storage.get( [ "sites", "current_site" ], function( data ) {
                var sites = parseSites( data.sites ),
                    current = data.current_site;

                sites[current].os_ip = ip + ( port === 80 ? "" : ":" + port );

                storage.set( { "sites":JSON.stringify( sites ) }, cloudSaveSites );
            } );
        },
        function() {
            storage.get( "ignoreRemoteFailed", function( data ) {
                if ( data.ignoreRemoteFailed !== "1" ) {

                    // Unable to access the device using it's public IP
                    addNotification( {
                        title: _( "Remote access is not enabled" ),
                        desc: _( "Click here to troubleshoot remote access issues" ),
                        on: function() {
                            var iab = window.open( "https://opensprinkler.freshdesk.com/support/solutions/articles/5000569763",
								"_blank", "location=" + ( isAndroid ? "yes" : "no" ) +
								",enableViewportScale=yes,toolbarposition=top,closebuttoncaption=" + _( "Back" ) );

                            if ( isIEMobile ) {
                                $.mobile.document.data( "iabOpen", true );
                                iab.addEventListener( "exit", function() {
                                    $.mobile.document.removeData( "iabOpen" );
                                } );
                            }

                            return false;
                        },
                        off: function() {
                            storage.set( { "ignoreRemoteFailed": "1" } );
                            return true;
                        }
                    } );
                }
            } );
        }
    );
}

function logout( success ) {
    if ( typeof success !== "function" ) {
        success = function() {};
    }

    areYouSure( _( "Are you sure you want to logout?" ), "", function() {
        if ( currLocal ) {
            storage.remove( [ "sites", "current_site", "lang", "provider", "wapikey", "runonce" ], function() {
                location.reload();
            } );
        } else {
            storage.remove( [ "cloudToken" ], function() {
                updateLoginButtons();
                success();
            } );
        }
    } );
}

function updateLoginButtons() {
    var page = $( ".ui-page-active" );

    storage.get( "cloudToken", function( data ) {
        if ( data.cloudToken === null || data.cloudToken === undefined ) {
            $( ".login-button" ).removeClass( "hidden" );
            $( ".logout-button" ).addClass( "hidden" );

            if ( page.attr( "id" ) === "site-control" ) {
                page.find( ".logged-in-alert" ).remove();
            }
        } else {
            $( ".logout-button" ).removeClass( "hidden" ).find( "a" ).text( _( "Logout" ) + " (" + getTokenUser( data.cloudToken ) + ")" );
            $( ".login-button" ).addClass( "hidden" );

            if ( page.attr( "id" ) === "site-control" && page.find( ".logged-in-alert" ).length === 0 ) {
                page.find( ".ui-content" ).prepend( addSyncStatus( data.cloudToken ) );
            }
        }
    } );
}

function addNotification( item ) {
    notifications.push( item );
    updateNotificationBadge();

    var panel = $( "#notificationPanel" );

    if ( panel.hasClass( "ui-panel-open" ) ) {
        panel.find( "ul" ).append( createNotificationItem( item ) ).listview( "refresh" );
    }
}

function updateNotificationBadge() {
    var total = notifications.length,
        header = $( "#header" );

    if ( total === 0 ) {
        header.find( ".notifications" ).hide();
    } else {
        header.find( ".notifications" ).show();
        header.find( ".notificationCount" ).text( total );
    }
}

function createNotificationItem( item ) {
    var listItem = $( "<li><a class='primary' href='#'><h2>" + item.title + "</h2>" + ( item.desc ? "<p>" + item.desc + "</p>" : "" ) +
		"</a><a class='ui-btn ui-btn-icon-notext ui-icon-delete'></a></li>" );

    listItem.find( ".primary" ).on( "click", item.on );
    listItem.find( ".ui-icon-delete" ).on( "click", function() {
        removeNotification( $( this ).parent() );
    } );

    return listItem;
}

function showNotifications() {
    if ( notifications.length === 0 ) {
        return;
    }

    var panel = $( "#notificationPanel" ),
        menu = $( "#footer-menu" ),
        items = [ $( "<li data-role='list-divider'>" + _( "Notifications" ) +
			"<button class='ui-btn ui-btn-icon-notext ui-icon-delete btn-no-border clear-all delete'></button></li>" )
		.on( "click", ".clear-all", function() {
            var button = $( this );

            if ( button.hasClass( "clear" ) ) {
                clearNotifications();
            } else {
                button.removeClass( "delete ui-btn-icon-notext ui-icon-delete" ).addClass( "clear" ).text( _( "Clear" ) );
                setTimeout( function() {
                $.mobile.document.one( "click", function() {
                        button.removeClass( "clear" ).addClass( "delete ui-btn-icon-notext ui-icon-delete" ).text( "" );
                    } );
                }, 1 );
            }
        } ) ];

    for ( var i = notifications.length - 1; i >= 0; i-- ) {
        items.push( createNotificationItem( notifications[i] ) );
    }

    panel.find( "ul" ).replaceWith( $( "<ul/>" ).append( items ).listview() );
    panel.on( "panelbeforeclose", function() {
        menu.removeClass( "moveLeft" );
    } );
    panel.panel().panel( "option", "classes.modal", "needsclick ui-panel-dismiss" );
    menu.addClass( "moveLeft" );
    panel.panel( "open" );
}

function clearNotifications() {
    var panel = $( "#notificationPanel" );
    notifications = [];
    updateNotificationBadge();
    panel.find( "ul" ).empty();
    if ( panel.hasClass( "ui-panel-open" ) ) {
        panel.panel( "close" );
    }
}

function removeNotification( button ) {
    var panel = $( "#notificationPanel" ),
        off = notifications[button.index() - 1].off;

    if ( typeof off === "function" ) {
        if ( !off() ) {
            return;
        }
    }

    notifications.remove( button.index() - 1 );
    button.remove();
    updateNotificationBadge();
    if ( notifications.length === 0 && panel.hasClass( "ui-panel-open" ) ) {
        panel.panel( "close" );
    }
}

function checkFirmwareUpdate() {

    // Update checks are only be available for Arduino firmwares
    if ( checkOSVersion( 200 ) ) {

        // Github API to get releases for OpenSprinkler firmware
        $.getJSON( "https://api.github.com/repos/opensprinkler/opensprinklergen2/releases" ).done( function( data ) {
            if ( controller.options.fwv < data[0].tag_name ) {

                // Grab a local storage variable which defines the firmware version for the last dismissed update
                storage.get( "updateDismiss", function( flag ) {

                    // If the variable does not exist or is lower than the newest update, show the update notification
                    if ( !flag.updateDismiss || flag.updateDismiss < data[0].tag_name ) {
                        addNotification( {
                            title: _( "Firmware update available" ),
                            on: function() {

                                // Modify the changelog by parsing markdown of lists to HTML
                                var button = $( this ).parent(),
                                    changelog = data[0].body.replace( /[\-|\*|\+]\s(.*)?(?:\r\n)?/g, "<li>$1</li>" ),
                                    popup = $(
                                        "<div data-role='popup' class='modal' data-theme='a'>" +
                                            "<h3 class='center' style='margin-bottom:0'>" +
												_( "Latest" ) + " " + _( "Firmware" ) + ": " + data[0].name +
											"</h3>" +
                                            "<h5 class='center' style='margin:0'>" + _( "This Controller" ) + ": " + getOSVersion() + getOSMinorVersion() + "</h5>" +
                                            "<ul class='changelog'>" + changelog + "</ul>" +
                                            "<a class='guide ui-btn ui-corner-all ui-shadow' style='width:80%;margin:5px auto;' href='#'>" +
												_( "Upgrade Guide" ) +
											"</a>" +
                                            "<a class='dismiss ui-btn ui-btn-b ui-corner-all ui-shadow' style='width:80%;margin:5px auto;' href='#'>" +
												_( "Dismiss" ) +
											"</a>" +
                                        "</div>"
                                    );

                                popup.find( ".guide" ).on( "click", function() {
									var url = controller.options.hwt > 63 ?
										"https://opensprinkler.freshdesk.com/support/solutions/articles/5000631599-installing-and-updating-the-unified-firmware#upgrade"
										: "https://opensprinkler.freshdesk.com/support/solutions/articles/5000381694-update-opensprinkler-firmware-with-downloads-";

                                    // Open the firmware upgrade guide in a child browser
                                    $( "<a class='hidden iab' href='" + url + "'></a>" )
										.appendTo( popup ).click();
                                } );

                                popup.find( ".dismiss" ).one( "click", function() {

                                    // Update the notification dismiss variable with the latest available version
                                    storage.set( { updateDismiss:data[0].tag_name } );
                                    popup.popup( "close" );
                                    removeNotification( button );
                                    return false;
                                } );

                                openPopup( popup );
                            }
                        } );
                    }
                } );
            }
        } );
    }
}

function checkOSPiVersion( check ) {
    var ver;

    if ( isOSPi() ) {
        ver = controller.options.fwv.split( "-" )[0];
        if ( ver !== check ) {
            ver = ver.split( "." );
            check = check.split( "." );
            return versionCompare( ver, check );
        } else {
            return true;
        }
    } else {
        return false;
    }
}

function checkOSVersion( check ) {
    if ( isOSPi() ) {
        return false;
    } else {
        if ( check === controller.options.fwv ) {
            return true;
        } else {
            return versionCompare( controller.options.fwv.toString().split( "" ), check.toString().split( "" ) );
        }
    }
}

function versionCompare( ver, check ) {

    // Returns false when check < ver and 1 when check > ver

    var max = Math.max( ver.length, check.length ),
        result;

    while ( ver.length < max ) {
        ver.push( 0 );
    }

    while ( check.length < max ) {
        check.push( 0 );
    }

    for ( var i = 0; i < max; i++ ) {
        result = Math.max( -1, Math.min( 1, ver[i] - check[i] ) );
        if ( result !== 0 ) {
            break;
        }
    }

    if ( result === -1 ) {
        result = false;
    }

    return result;
}

function getOSVersion( fwv ) {
    if ( !fwv && typeof controller.options === "object" ) {
        fwv = controller.options.fwv;
    }
    if ( typeof fwv === "string" && fwv.search( /ospi/i ) !== -1 ) {
        return fwv;
    } else {
        return ( fwv / 100 >> 0 ) + "." + ( ( fwv / 10 >> 0 ) % 10 ) + "." + ( fwv % 10 );
    }
}

function getOSMinorVersion() {
    if ( !isOSPi() && typeof controller.options === "object" && typeof controller.options.fwm === "number" && controller.options.fwm > 0 ) {
		return " (" + controller.options.fwm + ")";
    }
    return "";
}

function getHWVersion( hwv ) {
	if ( !hwv ) {
		if ( typeof controller.options === "object" && typeof controller.options.hwv !== "undefined" ) {
			hwv = controller.options.hwv;
		} else {
			return false;
		}
	}

	if ( typeof hwv === "string" ) {
		return hwv;
	} else {
        if ( hwv === 64 ) {
            return "OSPi";
        } else if ( hwv === 128 ) {
            return "OSBo";
        } else if ( hwv === 192 ) {
            return "Linux";
        } else if ( hwv === 255 ) {
            return "Demo";
        } else {
            return ( ( hwv / 10 >> 0 ) % 10 ) + "." + ( hwv % 10 );
        }
	}
}

function getHWType() {
	if ( isOSPi() || typeof controller.options.hwt !== "number" || controller.options.hwt === 0 ) {
		return "";
	}

	if ( controller.options.hwt === 172 ) {
		return " (AC)";
	} else if ( controller.options.hwt === 220 ) {
		return " (DC)";
	} else if ( controller.options.hwt === 26 ) {
		return " (Latching)";
	} else {
		return "";
	}
}

// Accessory functions for jQuery Mobile
function areYouSure( text1, text2, success, fail ) {
    $( "#sure" ).popup( "destroy" ).remove();
    success = success || function() {};
    fail = fail || function() {};

    var popup = $(
        "<div data-role='popup' data-theme='a' id='sure'>" +
            "<h3 class='sure-1 center'>" + text1 + "</h3>" +
            "<p class='sure-2 center'>" + text2 + "</p>" +
            "<a class='sure-do ui-btn ui-btn-b ui-corner-all ui-shadow' href='#'>" + _( "Yes" ) + "</a>" +
            "<a class='sure-dont ui-btn ui-corner-all ui-shadow' href='#'>" + _( "No" ) + "</a>" +
        "</div>"
    );

    //Bind buttons
    popup.find( ".sure-do" ).one( "click.sure", function() {
        popup.popup( "close" );
        success();
        return false;
    } );
    popup.find( ".sure-dont" ).one( "click.sure", function() {
        popup.popup( "close" );
        fail();
        return false;
    } );

    openPopup( popup );
}

function showIPRequest( opt ) {
    var defaults = {
            title: _( "Enter IP Address" ),
            ip: [ 0, 0, 0, 0 ],
            showBack: true,
            callback: function() {}
        };

    opt = $.extend( {}, defaults, opt );

    $( "#ipInput" ).popup( "destroy" ).remove();

    var popup = $( "<div data-role='popup' id='ipInput' data-theme='a'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + opt.title + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                "<span>" +
                    "<fieldset class='ui-grid-c incr'>" +
                        "<div class='ui-block-a'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-b'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-c'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-d'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>" +
                    "</fieldset>" +
                    "<div class='ui-grid-c inputs'>" +
                        "<div class='ui-block-a'><input data-wrapper-class='pad_buttons' class='ip_addr' type='number' pattern='[0-9]*' max='255' value='" + opt.ip[0] + "'></div>" +
                        "<div class='ui-block-b'><input data-wrapper-class='pad_buttons' class='ip_addr' type='number' pattern='[0-9]*' max='255' value='" + opt.ip[1] + "'></div>" +
                        "<div class='ui-block-c'><input data-wrapper-class='pad_buttons' class='ip_addr' type='number' pattern='[0-9]*' max='255' value='" + opt.ip[2] + "'></div>" +
                        "<div class='ui-block-d'><input data-wrapper-class='pad_buttons' class='ip_addr' type='number' pattern='[0-9]*' max='255' value='" + opt.ip[3] + "'></div>" +
                    "</div>" +
                    "<fieldset class='ui-grid-c decr'>" +
                        "<div class='ui-block-a'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-b'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-c'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>" +
                        "<div class='ui-block-d'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>" +
                    "</fieldset>" +
                "</span>" +
                ( opt.showBack ? "<button class='submit' data-theme='b'>" + _( "Submit" ) + "</button>" : "" ) +
            "</div>" +
        "</div>" ),
        changeValue = function( pos, dir ) {
            var input = popup.find( ".inputs input" ).eq( pos ),
                val = parseInt( input.val() );

            if ( ( dir === -1 && val === 0 ) || ( dir === 1 && val >= 255 ) ) {
                return;
            }

            input.val( val + dir );
            opt.callback( getIP() );
        },
        getIP = function() {
            return $.makeArray( popup.find( ".ip_addr" ).map( function() {return parseInt( $( this ).val() );} ) );
        };

    popup.find( "button.submit" ).on( "click", function() {
        opt.callback( getIP() );
        popup.popup( "destroy" ).remove();
    } );

    popup.on( "focus", "input[type='number']", function() {
        this.value = "";
    } ).on( "blur", "input[type='number']", function() {
        if ( this.value === "" ) {
            this.value = "0";
        }
    } );

    holdButton( popup.find( ".incr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, 1 );
        return false;
    } );

    holdButton( popup.find( ".decr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, -1 );
        return false;
    } );

    popup
    .css( "max-width", "350px" )
    .one( "popupafterclose", function() {
        opt.callback( getIP() );
    } );

    openPopup( popup );
}

function showDurationBox( opt ) {
    var defaults = {
            seconds: 0,
            title: _( "Duration" ),
            granularity: 0,
            preventCompression: false,
            incrementalUpdate: true,
            showBack: true,
            showSun: false,
            minimum: 0,
            callback: function() {}
        },
        type = 0;

    opt = $.extend( {}, defaults, opt );

    $( "#durationBox" ).popup( "destroy" ).remove();

    opt.seconds = parseInt( opt.seconds );

    if ( opt.seconds === 65535 ) {
        type = 1;
        opt.seconds = 0;
    } else if ( opt.seconds === 65534 ) {
        type = 2;
        opt.seconds = 0;
    }

    var keys = [ "days", "hours", "minutes", "seconds" ],
        text = [ _( "Days" ), _( "Hours" ), _( "Minutes" ), _( "Seconds" ) ],
        conv = [ 86400, 3600, 60, 1 ],
        max = [ 0, 23, 59, 59 ],
        total = 4 - opt.granularity,
        start = 0,
        arr = sec2dhms( opt.seconds ),
        i;

    if ( !opt.preventCompression && ( checkOSVersion( 210 ) && opt.maximum > 64800 ) ) {
        opt.maximum = checkOSVersion( 214 ) ? 57600 : 64800;
    }

    if ( opt.maximum ) {
        for ( i = conv.length - 1; i >= 0; i-- ) {
            if ( opt.maximum < conv[i] ) {
                start = i + 1;
                total = ( conv.length - start ) - opt.granularity;
                break;
            }
        }
    }

    var incrbts = "<fieldset class='ui-grid-" + String.fromCharCode( 95 + ( total ) ) + " incr'>",
        inputs = "<div class='ui-grid-" + String.fromCharCode( 95 + ( total ) ) + " inputs'>",
        decrbts = "<fieldset class='ui-grid-" + String.fromCharCode( 95 + ( total ) ) + " decr'>",
        popup = $( "<div data-role='popup' id='durationBox' data-theme='a'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + opt.title + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                ( opt.helptext ? "<p class='rain-desc center smaller'>" + opt.helptext + "</p>" : "" ) +
                "<span>" +
                "</span>" +
                ( opt.showSun ? "<div class='ui-grid-a useSun'>" +
                    "<div class='ui-block-a'>" +
                        "<button value='65534' class='ui-mini ui-btn rise " + ( type === 2 ? "ui-btn-active" : "" ) + "'>" + _( "Sunrise to Sunset" ) + "</button>" +
                    "</div>" +
                    "<div class='ui-block-b'>" +
                        "<button value='65535' class='ui-mini ui-btn set " + ( type === 1 ? "ui-btn-active" : "" ) + "'>" + _( "Sunset to Sunrise" ) + "</button>" +
                    "</div>" +
                "</div>" : "" ) +
                ( opt.showBack ? "<button class='submit' data-theme='b'>" + _( "Submit" ) + "</button>" : "" ) +
            "</div>" +
        "</div>" ),
        changeValue = function( pos, dir ) {
            var input = popup.find( ".inputs input" ).eq( pos ),
                apos = pos + start,
                val = parseInt( input.val() ),
                next = parseInt( popup.find( ".inputs input" ).eq( pos - 1 ).val() );

            if ( input.prop( "disabled" ) ) {
                return;
            }

            if ( ( dir === -1 && ( getValue() <= opt.minimum || next > 0 && val <= 0 ) ) || ( dir === 1 && ( getValue() + conv[apos] ) > opt.maximum ) ) {
                return;
            }

            // Increment next time field on current max
            if ( ( max[apos] !== 0 && pos !== 0 && Math.abs( val ) >= max[apos] ) ) {
                input.val( 0 );
                input = popup.find( ".inputs input" ).eq( pos - 1 );
                val = parseInt( input.val() );
            }

            input.val( val + dir );
            if ( opt.incrementalUpdate ) {
                opt.callback( getValue() );
            }

            if ( !opt.preventCompression && checkOSVersion( 210 ) ) {
                var state = ( dir === 1 ) ? true : false;

                if ( dir === 1 ) {
                    if ( getValue() >= 60 ) {
                        toggleInput( "seconds", state );
                    }
                    if ( getValue() >= 10800 ) {
                        toggleInput( "minutes", state );
                    }
                } else if ( dir === -1 ) {
                    if ( getValue() <= -60 ) {
                        toggleInput( "seconds", !state );
                    } else if ( getValue() <= -10800 ) {
                        toggleInput( "minutes", !state );
                    } else if ( getValue() < 60 ) {
                        toggleInput( "seconds", state );
                    } else if ( getValue() < 10800 ) {
                        toggleInput( "minutes", state );
                    }
                }
            }
        },
        getValue = function() {
            var useSun = popup.find( ".useSun" ).find( "button.ui-btn-active" );

            if ( useSun.length === 1 ) {
                return parseInt( useSun.val() );
            } else {
                return dhms2sec( {
                    "days": parseInt( popup.find( ".days" ).val() ) || 0,
                    "hours": parseInt( popup.find( ".hours" ).val() ) || 0,
                    "minutes": parseInt( popup.find( ".minutes" ).val() ) || 0,
                    "seconds": parseInt( popup.find( ".seconds" ).val() ) || 0
                } );
            }
        },
        toggleInput = function( field, state ) {
            popup.find( "." + field ).toggleClass( "ui-state-disabled", state ).prop( "disabled", state ).val( function() {
                if ( state ) {
                    return 0;
                } else {
                    return this.value;
                }
            } ).parent( ".ui-input-text" ).toggleClass( "ui-state-disabled", state );
        };

    for ( i = start; i < conv.length - opt.granularity; i++ ) {
        incrbts += "<div " + ( ( total > 1 ) ? "class='ui-block-" + String.fromCharCode( 97 + i - start ) + "'" : "" ) + ">" +
			"<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>";
        inputs += "<div " + ( ( total > 1 ) ? "class='ui-block-" + String.fromCharCode( 97 + i - start ) + "'" : "" ) + "><label class='center'>" +
			_( text[i] ) + "</label><input data-wrapper-class='pad_buttons' class='" + keys[i] + "' type='number' pattern='[0-9]*' value='" +
			arr[keys[i]] + "'></div>";
        decrbts += "<div " + ( ( total > 1 ) ? "class='ui-block-" + String.fromCharCode( 97 + i - start ) + "'" : "" ) +
			"><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>";
    }

    incrbts += "</fieldset>";
    inputs += "</div>";
    decrbts += "</fieldset>";

    popup.find( "span" ).prepend( incrbts + inputs + decrbts );

    popup.find( "button.submit" ).on( "click", function() {
        opt.callback( getValue() );
        popup.popup( "destroy" ).remove();
    } );

    if ( !opt.preventCompression && checkOSVersion( 210 ) ) {
        if ( opt.seconds <= -60 ) {
            toggleInput( "seconds", true );
        }

        if ( opt.seconds <= -10800 ) {
            toggleInput( "minutes", true );
        }

        if ( opt.seconds >= 60 ) {
            toggleInput( "seconds", true );
        }

        if ( opt.seconds >= 10800 ) {
            toggleInput( "minutes", true );
        }
    }

    popup.on( "focus", "input[type='number']", function() {
        this.value = "";
    } ).on( "blur", "input[type='number']", function() {
        if ( this.value === "" ) {
            this.value = "0";
        }
    } );

    holdButton( popup.find( ".incr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, 1 );
        return false;
    } );

    holdButton( popup.find( ".decr" ).children(), function( e ) {
        var pos = $( e.currentTarget ).index();
        changeValue( pos, -1 );
        return false;
    } );

    if ( opt.showSun ) {
        popup.find( ".useSun" ).on( "click", "button", function() {
            var button = $( this ),
                contraButton = popup.find( ".useSun" ).find( "button" ).not( button ),
                timeButtons = popup.find( "span" ).find( ".ui-btn,input" );

            contraButton.removeClass( "ui-btn-active" );
            if ( button.hasClass( "ui-btn-active" ) ) {
                button.removeClass( "ui-btn-active" );
                timeButtons.prop( "disabled", false ).removeClass( "ui-disabled" );
            } else {
                button.addClass( "ui-btn-active" );
                timeButtons.prop( "disabled", true ).addClass( "ui-disabled" );
            }

            if ( opt.incrementalUpdate ) {
                opt.callback( getValue() );
            }
        } );
    }

    popup
    .css( "max-width", "350px" )
    .one( "popupafteropen", function() {
        if ( type !== 0 ) {
            popup.find( "span" ).find( ".ui-btn,input" ).prop( "disabled", true ).addClass( "ui-disabled" );
        }
    } )
    .one( "popupafterclose", function() {
        if ( opt.incrementalUpdate ) {
            opt.callback( getValue() );
        }
    } );

    openPopup( popup );
}

function showSingleDurationInput( opt ) {
    $( "#singleDuration" ).popup( "destroy" ).remove();
    var defaults = {
        data: 0,
        title: _( "Duration" ),
        minimum: 0,
        label: "",
        updateOnChange: true,
        showBack: true,
        callback: function() {}
    };

    opt = $.extend( {}, defaults, opt );

    var popup = $( "<div data-role='popup' id='singleDuration' data-theme='a'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + opt.title + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                ( opt.helptext ? "<p class='rain-desc center smaller'>" + opt.helptext + "</p>" : "" ) +
                "<label class='center'>" + opt.label + "</label>" +
                "<div class='input_with_buttons'>" +
                    "<button class='decr ui-btn ui-btn-icon-notext ui-icon-carat-l btn-no-border'></button>" +
                    "<input type='number' pattern='[0-9]*' value='" + opt.data + "'>" +
                    "<button class='incr ui-btn ui-btn-icon-notext ui-icon-carat-r btn-no-border'></button>" +
                "</div>" +
                ( opt.updateOnChange && !opt.showBack ? "" : "<input type='submit' data-theme='b' value='" + _( "Submit" ) + "'>" ) +
            "</div>" +
        "</div>" ),
        input = popup.find( "input" ),
        changeValue = function( dir ) {
            var val = parseInt( input.val() );

            if ( ( dir === -1 && val === opt.minimum ) || ( dir === 1 && val === opt.maximum ) ) {
                return;
            }

            input.val( val + dir );
            if ( opt.updateOnChange ) {
                opt.callback( val + dir );
            }
        };

    holdButton( popup.find( ".incr" ), function() {
        changeValue( 1 );
        return false;
    } );
    holdButton( popup.find( ".decr" ), function() {
        changeValue( -1 );
        return false;
    } );

    popup.find( "input[type='number']" ).on( "focus", function() {
        this.value = "";
    } ).on( "blur", function() {
        if ( this.value === "" ) {
            this.value = "0";
        }
    } );

    popup.find( "input[type='submit']" ).on( "click", function() {
        opt.callback( input.val() );
        popup.popup( "destroy" ).remove();
    } );

    popup
    .one( "popupafterclose", function() {
        if ( opt.updateOnChange ) {
            opt.callback( input.val() );
        }
    } );

    openPopup( popup );
}

function showDateTimeInput( timestamp, callback ) {
    $( "#datetimeInput" ).popup( "destroy" ).remove();

    if ( !( timestamp instanceof Date ) ) {
        timestamp = new Date( timestamp * 1000 );
        timestamp.setMinutes( timestamp.getMinutes() - timestamp.getTimezoneOffset() );
    }

    callback = callback || function() {};

    var keys = [ "Month", "Date", "FullYear", "Hours", "Minutes" ],
        monthNames = [ _( "Jan" ), _( "Feb" ), _( "Mar" ), _( "Apr" ), _( "May" ), _( "Jun" ), _( "Jul" ),
			_( "Aug" ), _( "Sep" ), _( "Oct" ), _( "Nov" ), _( "Dec" ) ],
        popup = $( "<div data-role='popup' id='datetimeInput' data-theme='a'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + _( "Enter Date/Time" ) + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
            "</div>" +
        "</div>" ),
        changeValue = function( pos, dir ) {
            timestamp["setUTC" + pos]( timestamp["getUTC" + pos]() + dir );
            callback( new Date( timestamp.getTime() ) );
            updateContent();
        },
        updateContent = function() {
            var incrbts = "<fieldset class='ui-grid-d incr'>",
                inputs = "<div class='ui-grid-d inputs'>",
                decrbts = "<fieldset class='ui-grid-d decr'>",
                val, mark, i;

            for ( i = 0; i < 5; i++ ) {
                val = timestamp["getUTC" + keys[i]]();
                mark = "";

                if ( keys[i] === "Month" ) {
                    val = "<p class='center'>" + monthNames[val] + "</p>";
                } else if ( keys[i] === "Date" ) {
                    val = "<p class='center'>" + val + ",</p>";
                } else if ( keys[i] === "Hours" ) {
                    val = "<p style='width:90%;display:inline-block' class='center'>" + val + "</p><p style='display:inline-block'>:</p>";
                } else {
                    val = "<p class='center'>" + val + "</p>";
                }

                incrbts += "<div class='ui-block-" + String.fromCharCode( 97 + i ) + "'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a></div>";
                inputs += "<div id='" + keys[i] + "' class='ui-block-" + String.fromCharCode( 97 + i ) + "'>" + val + "</div>";
                decrbts += "<div class='ui-block-" + String.fromCharCode( 97 + i ) + "'><a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a></div>";
            }

            incrbts += "</fieldset>";
            inputs += "</div>";
            decrbts += "</fieldset>";

            popup.find( ".ui-content" ).html( "<span>" + incrbts + inputs + decrbts + "</span>" ).enhanceWithin();

            popup.find( ".incr" ).children().on( "vclick", function() {
                var pos = $( this ).index();
                changeValue( popup.find( ".inputs" ).children().eq( pos ).attr( "id" ), 1 );
                return false;
            } );

            popup.find( ".decr" ).children().on( "vclick", function() {
                var pos = $( this ).index();
                changeValue( popup.find( ".inputs" ).children().eq( pos ).attr( "id" ), -1 );
                return false;
            } );
    };

    updateContent();

    popup
    .css( "width", "280px" )
    .one( "popupafterclose", function() {
        callback( timestamp );
    } );

    openPopup( popup );
}

function showTimeInput( opt ) {
    var defaults = {
            minutes: 0,
            title: _( "Time" ),
            incrementalUpdate: true,
            showBack: true,
            showSun: false,
            callback: function() {}
        };

    opt = $.extend( {}, defaults, opt );

    $( "#timeInput" ).popup( "destroy" ).remove();

    var offset = opt.minutes & 0x7ff,
        type = 0;

    if ( ( opt.minutes >> 12 ) & 1 ) {
        offset = -offset;
    }
    if ( ( opt.minutes >> 14 ) & 1 ) {
        type = 1;
    } else if ( ( opt.minutes >> 13 ) & 1 ) {
        type = 2;
    }

    var isPM = ( opt.minutes > 719 ? true : false ),
        getPeriod = function() {
            return isPM ? _( "PM" ) : _( "AM" );
        },
        popup = $( "<div data-role='popup' id='timeInput' data-theme='a'>" +
            "<div data-role='header' data-theme='b'>" +
                "<h1>" + opt.title + "</h1>" +
            "</div>" +
            "<div class='ui-content'>" +
                ( opt.helptext ? "<p class='pad-top rain-desc center smaller'>" + opt.helptext + "</p>" : "" ) +
                "<span>" +
                    "<fieldset class='ui-grid-b incr'>" +
                        "<div class='ui-block-a'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='plus' data-iconpos='bottom'></a>" +
                        "</div>" +
                    "</fieldset>" +
                    "<div class='ui-grid-b inputs'>" +
                        "<div class='ui-block-a'>" +
                            "<input data-wrapper-class='pad_buttons' class='hour' type='number' pattern='[0-9]*' value='" +
								( parseInt( opt.minutes / 60 ) % 12 === 0 ? 12 : parseInt( opt.minutes / 60 ) % 12 ) + "'>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<input data-wrapper-class='pad_buttons' class='minute' type='number' pattern='[0-9]*' value='" +
								pad( opt.minutes % 60 ) + "'>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<p class='center period'>" + getPeriod() + "</p>" +
                        "</div>" +
                    "</div>" +
                    "<fieldset class='ui-grid-b decr'>" +
                        "<div class='ui-block-a'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-b'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                        "<div class='ui-block-c'>" +
                            "<a href='#' data-role='button' data-mini='true' data-corners='true' data-icon='minus' data-iconpos='bottom'></a>" +
                        "</div>" +
                    "</fieldset>" +
                "</span>" +
                ( opt.showSun ? "<div class='ui-grid-a useSun'>" +
                    "<div class='ui-block-a'>" +
                        "<button class='ui-mini ui-btn rise " + ( type === 1 ? "ui-btn-active" : "" ) + "'>" + _( "Use Sunrise" ) + "</button>" +
                    "</div>" +
                    "<div class='ui-block-b'>" +
                        "<button class='ui-mini ui-btn set " + ( type === 2 ? "ui-btn-active" : "" ) + "'>" + _( "Use Sunset" ) + "</button>" +
                    "</div>" +
                "</div>" +
                "<div class='offsetInput'" + ( type === 0 ? " style='display: none;'" : "" ) + ">" +
                    "<h5 class='center tight'>" + _( "Offset (minutes)" ) + "</h5>" +
                    "<div class='input_with_buttons'>" +
                        "<button class='decr ui-btn ui-btn-icon-notext ui-icon-carat-l btn-no-border'></button>" +
                        "<input type='number' pattern='[0-9]*' value='" + offset + "'>" +
                        "<button class='incr ui-btn ui-btn-icon-notext ui-icon-carat-r btn-no-border'></button>" +
                    "</div>" +
                "</div>" : "" ) +
                ( opt.showBack ? "<button class='submit' data-theme='b'>" + _( "Submit" ) + "</button>" : "" ) +
            "</div>" +
        "</div>" ),
        changeValue = function( pos, dir ) {
            if ( pos === 0 || pos === 1 ) {
                var curr = getValue(),
                    to = curr + ( dir * ( pos === 0 ? 60 : 1 ) ),
                    input = popup.find( ".inputs input" ).eq( pos ),
                    isHour = input.hasClass( "hour" ),
                    val = parseInt( input.val() );

                if ( dir === 1 ) {
                    if ( isHour && val >= 12 ) {
                        val = 0;
                    }
                    if ( !isHour && val >= 59 ) {
                        val = -1;
                        var hour = popup.find( ".hour" ),
                            hourFixed = parseInt( hour.val() );

                        if ( hourFixed === 12 ) {
                            hourFixed = 0;
                        }

                        hour.val( hourFixed + 1 );
                    }
                } else if ( isHour && val <= 1 ) {
                    val = 13;
                } else if ( !isHour && val <= 0 ) {
                    return;
                }

                if ( ( !isPM && to > 719 ) || ( isPM && to < 721 ) || ( isPM && to > 1439 ) || ( !isPM && dir === -1 && to < 0 ) ) {
                    isPM = !isPM;
                    popup.find( ".period" ).text( getPeriod() );
                }

                val = isHour ? val + dir : pad( val + dir );
                input.val( val );
            } else if ( pos === 2 ) {
                isPM = !isPM;
                popup.find( ".period" ).text( getPeriod() );
            }

            if ( opt.incrementalUpdate ) {
                opt.callback( getValue() );
            }
        },
        getValue = function() {
            var useSun = popup.find( ".useSun" ).find( "button.ui-btn-active" );

            if ( useSun.length === 1 ) {
                var st = 0,
                    offset = parseInt( popup.find( ".offsetInput input" ).val() );
                if ( useSun.hasClass( "rise" ) ) {
                    if ( offset >= 0 ) {
                        st = offset;
                    } else {
                        st = -offset;
                        st |= ( 1 << 12 );
                    }
                    st |= ( 1 << 14 );    // set the sunrise bit
                } else {
                    if ( offset >= 0 ) {
                        st = offset;
                    } else {
                        st = -offset;
                        st |= ( 1 << 12 );  // set the sign bit
                    }
                    st |= ( 1 << 13 );  // set the sunset bit
                }

                return st;
            } else {
                var hour = parseInt( popup.find( ".hour" ).val() );

                if ( isPM && hour !== 12 ) {
                    hour = hour + 12;
                }

                if ( !isPM && hour === 12 ) {
                    hour = 0;
                }

                return ( hour * 60 ) + parseInt( popup.find( ".minute" ).val() );
            }
        };

    popup.find( "button.submit" ).on( "click", function() {
        opt.callback( getValue() );
        popup.popup( "destroy" ).remove();
    } );

    popup.on( "focus", "input[type='number']", function() {
        this.value = "";
    } ).on( "blur", "input[type='number']", function() {
        var val = parseInt( this.value ) || 0;
        this.value = $( this ).hasClass( "hour" ) ? val : pad( val );
    } );

    holdButton( popup.find( ".incr" ).children(), function( e ) {
        var button = $( e.currentTarget ),
            pos = button.index();

        if ( button.find( ".ui-disabled" ).length === 0 ) {
            changeValue( pos, 1 );
        }

        return false;
    } );

    holdButton( popup.find( ".decr" ).children(), function( e ) {
        var button = $( e.currentTarget ),
            pos = button.index();

        if ( button.find( ".ui-disabled" ).length === 0 ) {
            changeValue( pos, -1 );
        }

        return false;
    } );

    if ( opt.showSun ) {
        popup.find( ".useSun" ).on( "click", "button", function() {
            var button = $( this ),
                contraButton = popup.find( ".useSun" ).find( "button" ).not( button ),
                offset = popup.find( ".offsetInput" ),
                timeButtons = popup.find( "span" ).find( ".ui-btn,input,p" );

            contraButton.removeClass( "ui-btn-active" );
            if ( button.hasClass( "ui-btn-active" ) ) {
                button.removeClass( "ui-btn-active" );
                offset.slideUp();

                timeButtons.prop( "disabled", false ).removeClass( "ui-disabled" );
            } else {
                button.addClass( "ui-btn-active" );
                offset.slideDown();

                timeButtons.prop( "disabled", true ).addClass( "ui-disabled" );
            }

            if ( opt.incrementalUpdate ) {
                opt.callback( getValue() );
            }
        } );

        var offsetInput = popup.find( ".offsetInput" ).find( "input" ),
            changeOffset = function( dir ) {
                var val = parseInt( offsetInput.val() );

                if ( ( dir === -1 && val === -240 ) || ( dir === 1 && val === 240 ) ) {
                    return;
                }

                offsetInput.val( val + dir );

                if ( opt.incrementalUpdate ) {
                    opt.callback( getValue() );
                }
            };

        offsetInput.on( "focus", function() {
            this.value = "";
        } ).on( "blur", function() {
            if ( this.value === "" ) {
                this.value = "0";
            } else if ( this.value > 240 ) {
                this.value = "240";
            } else if ( this.value < -240 ) {
                this.value = "-240";
            }
        } );

        holdButton( popup.find( ".offsetInput" ).find( ".incr" ), function() {
            changeOffset( 1 );
            return false;
        } );
        holdButton( popup.find( ".offsetInput" ).find( ".decr" ), function() {
            changeOffset( -1 );
            return false;
        } );
    }

    popup
    .css( "max-width", "350px" )
    .one( "popupafteropen", function() {
        if ( type !== 0 ) {
            popup.find( "span" ).find( ".ui-btn,input,p" ).prop( "disabled", true ).addClass( "ui-disabled" );
        }
    } )
    .one( "popupafterclose", function() {
        if ( opt.incrementalUpdate ) {
            opt.callback( getValue() );
        }
    } );

    openPopup( popup );
}

function showHelpText( e ) {
    e.stopImmediatePropagation();

    var button = $( this ),
        text = button.data( "helptext" ),
        popup;

    if ( button.parent().attr( "for" ) === "wtkey" ) {
        text += "<a class='iab' target='_blank' href='https://opensprinkler.freshdesk.com/support/solutions/articles/5000017485-getting-a-weather-api#article-show-5000017485'>here</a>.";
    }

    popup = $( "<div data-role='popup' data-theme='a'>" +
        "<p>" + text + "</p>" +
    "</div>" );

    openPopup( popup, { positionTo: button } );

    return false;
}

$.fn.focusInput = function() {
    if ( this.get( 0 ).setSelectionRange ) {
        this.focus();
        this.get( 0 ).setSelectionRange( 0, this.val().length );
    } else if ( this.get( 0 ).createTextRange ) {
        var range = this.get( 0 ).createTextRange();
        range.collapse( true );
        range.moveEnd( "character", this.val().length );
        range.moveStart( "character", 0 );
        range.select();
    }

    return this;
};

function changePage( toPage, opts ) {
    opts = opts || {};
    if ( toPage.indexOf( "#" ) !== 0 ) {
        toPage = "#" + toPage;
    }

    // Close the panel before page transition to avoid bug in jQM 1.4+
    closePanel( function() {
        $.mobile.pageContainer.pagecontainer( "change", toPage, opts );
    } );
}

function openPopup( popup, args ) {
    args = $.extend( {}, {
        history: false,
        positionTo: "window",
        overlayTheme: "b"
    }, args );

    $.mobile.pageContainer.append( popup );

    popup.one( "popupafterclose", function() {
        popup.popup( "destroy" ).remove();
    } ).popup( args ).enhanceWithin();

    popup.popup( "open" );
}

function closePanel( callback ) {
    var panel = $( ".ui-panel-open" );
    if ( panel.length > 0 ) {
        panel.one( "panelclose", function() {
            callback();
        } );
        panel.panel( "close" );
        return;
    } else {
        callback();
    }
}

// Change persistent header
function changeHeader( opt ) {

    // Declare function defaults
    var defaults = {
            title: "",
            class: "",
            animate: true,
            leftBtn: {
                icon: "",
                class: "",
                text: "",
                on: function() {}
            },
            rightBtn: {
                icon: "",
                class: "",
                text: "",
                on: function() {}
            }
        },
        header = $( "#header" );

    // Merge defaults with supplied options
    opt = $.extend( true, {}, defaults, opt );

    // Change default page title to the logo
    if ( opt.title === "" && opt.class === "" ) {
        opt.class = "logo";
    }

    // Generate new header content
    var newHeader = $( "<button data-icon='" + opt.leftBtn.icon + "' " + ( opt.leftBtn.text === "" ? "data-iconpos='notext' " : "" ) +
				"class='ui-btn-left " + opt.leftBtn.class + "'>" + opt.leftBtn.text + "</button>" +
            "<h3 class='" + opt.class + "'>" + opt.title + "</h3>" +
            "<button data-icon='" + opt.rightBtn.icon + "' " + ( opt.rightBtn.text === "" ? "data-iconpos='notext' " : "" ) +
				"class='ui-btn-right " + opt.rightBtn.class + "'>" + opt.rightBtn.text + "</button>" ),
        speed = opt.animate ? "fast" : 0;

    // Fade out the header content, replace it, and update the header
    header.children().stop().fadeOut( speed, function() {
        header.html( newHeader ).toolbar( header.hasClass( "ui-header" ) ? "refresh" : null );
        header.find( ".ui-btn-left" ).on( "click", opt.leftBtn.on );
        header.find( ".ui-btn-right" ).on( "click", opt.rightBtn.on );
    } ).fadeIn( speed );

    return newHeader;
}

function getPageTop() {
	var theWindow = $.mobile.window;

	return {
		x: ( theWindow[ 0 ].innerWidth || theWindow.width() ) / 2 + theWindow.scrollLeft(),
		y: theWindow.scrollTop() + 22.5
	};
}

// Show loading indicator within element(s)
function showLoading( ele ) {
    ele = ( typeof ele === "string" ) ? $( ele ) : ele;
    ele.off( "click" ).html( "<p class='ui-icon ui-icon-loading mini-load'></p>" );

    var footer = ele.filter( "#footer-running" );
    if ( footer.length === 1 ) {
        footer.find( ".mini-load" ).addClass( "bottom" );
    }
}

function goHome( firstLoad ) {

    // Transition to home page after succesful load
    if ( $( ".ui-page-active" ).attr( "id" ) !== "sprinklers" ) {
        $.mobile.document.one( "pageshow", function() {

            // Allow future transitions to properly animate
            delete $.mobile.navigate.history.getActive().transition;
        } );

        var opts = {
            "reverse": true
        };

        if ( firstLoad === true ) {
            opts = {
                "firstLoad": true,
                "showLoading": false,
                "transition": "none"
            };
        }

        changePage( "#sprinklers", opts );
    }
}

function goBack() {
    var page = $( ".ui-page-active" ).attr( "id" ),
        managerStart = ( page === "site-control" && !isControllerConnected() ),
        popup = $( ".ui-popup-active" );

    if ( popup.length ) {
        popup.find( "[data-role='popup']" ).popup( "close" );
        return;
    }

    if ( page === "sprinklers" || page === "start" || managerStart ) {
        try {
            navigator.app.exitApp();
        } catch ( err ) {}
    } else {
        if ( isChromeApp ) {
            var url = $.mobile.navigate.history.getPrev().url;

            if ( url.slice( 0, 1 ) !== "#" ) {
                return;
            }

            changePage( url, {
                reverse: true
            } );
            $.mobile.document.one( "pagehide", function() {
                $.mobile.navigate.history.activeIndex -= 2;
            } );
        } else {
            $.mobile.back();
        }
    }
}

function checkChangesBeforeBack() {
    checkChanges( goBack );
}

function checkChanges( callback ) {
    var page = $( ".ui-page-active" ),
        changed = page.find( ".hasChanges" );

    callback = callback || function() {};

    if ( changed.length !== 0 ) {
        areYouSure( _( "Do you want to save your changes?" ), "", function() {
            changed.click();
            if ( !changed.hasClass( "preventBack" ) ) {
                callback();
            }
        }, callback );
        return false;
    } else {
        callback();
    }
}

// show error message
function showerror( msg, dur ) {
    dur = dur || 2500;

    clearTimeout( errorTimeout );

    $.mobile.loading( "show", {
        text: msg,
        textVisible: true,
        textonly: true,
        theme: "b"
    } );

    // hide after delay
    errorTimeout = setTimeout( function() {$.mobile.loading( "hide" );}, dur );
}

// Accessory functions
function fixInputClick( page ) {

    // Handle Fast Click quirks
    if ( !FastClick.notNeeded( document.body ) ) {
        page.find( "input[type='checkbox']:not([data-role='flipswitch']),.ui-select > .ui-btn" ).addClass( "needsclick" );
        page.find( ".ui-collapsible-heading-toggle" ).on( "click", function() {
            var heading = $( this );

            setTimeout( function() {
                heading.removeClass( "ui-btn-active" );
            }, 100 );
        } );
    }
}

// Bind buttons to allow push and hold effects
function holdButton( target, callback ) {
    var intervalId;

    target.on( isTouchCapable ? "tap" : "click", callback ).on( "taphold", function( e ) {
        intervalId = setInterval( function() {
            callback( e );
        }, 100 );
    } ).on( "vmouseup vmouseout vmousecancel touchend", function() {
        clearInterval( intervalId );
    } ).on( "touchmove", function( e ) {
        e.preventDefault();
    } );
}

// Insert style string into the DOM
function insertStyle( style ) {
    var a = document.createElement( "style" );
    a.innerHTML = style;
    document.head.appendChild( a );
}

// Convert all elements in array to integer
function parseIntArray( arr ) {
    for ( var i = 0; i < arr.length; i++ ) {arr[i] = +arr[i];}
    return arr;
}

function getDurationText( time ) {
    if ( time === 65535 ) {
        return _( "Sunset to Sunrise" );
    } else if ( time === 65534 ) {
        return _( "Sunrise to Sunset" );
    } else {
        return dhms2str( sec2dhms( time ) );
    }
}

// Convert seconds into (HH:)MM:SS format. HH is only reported if greater than 0.
function sec2hms( diff ) {
    var str = "";
    var hours = Math.max( 0, parseInt( diff / 3600 ) % 24 );
    var minutes = Math.max( 0, parseInt( diff / 60 ) % 60 );
    var seconds = diff % 60;
    if ( hours ) {
        str += pad( hours ) + ":";
    }
    return str + pad( minutes ) + ":" + pad( seconds );
}

// Convert seconds into array of days, hours, minutes and seconds.
function sec2dhms( diff ) {
    var isNegative = ( diff < 0 ) ? -1 : 1;
    diff = Math.abs( diff );
    return {
        "days": Math.max( 0, parseInt( diff / 86400 ) ) * isNegative,
        "hours": Math.max( 0, parseInt( diff % 86400 / 3600 ) ) * isNegative,
        "minutes": Math.max( 0, parseInt( ( diff % 86400 ) % 3600 / 60 ) ) * isNegative,
        "seconds": Math.max( 0, parseInt( ( diff % 86400 ) % 3600 % 60 ) ) * isNegative
    };
}

function dhms2str( arr ) {
    var str = "";
    if ( arr.days ) {
        str += arr.days + _( "d" ) + " ";
    }
    if ( arr.hours ) {
        str += arr.hours + _( "h" ) + " ";
    }
    if ( arr.minutes ) {
        str += arr.minutes + _( "m" ) + " ";
    }
    if ( arr.seconds ) {
        str += arr.seconds + _( "s" ) + " ";
    }
    if ( str === "" ) {
        str = "0" + _( "s" );
    }
    return str.trim();
}

// Convert days, hours, minutes and seconds array into seconds (int).
function dhms2sec( arr ) {
    return parseInt( ( arr.days * 86400 ) + ( arr.hours * 3600 ) + ( arr.minutes * 60 ) + arr.seconds );
}

function isControllerConnected() {
	if ( currIp === "" ||
		$.isEmptyObject( controller ) ||
		$.isEmptyObject( controller.options ) ||
		$.isEmptyObject( controller.programs ) ||
		$.isEmptyObject( controller.settings ) ||
		$.isEmptyObject( controller.status ) ||
		$.isEmptyObject( controller.stations ) ) {

			return false;
	}

	return true;
}

// Generate export link for JSON data
function exportObj( ele, obj, subject ) {
    obj = encodeURIComponent( JSON.stringify( obj ) );

    if ( isFileCapable ) {
        $( ele ).attr( {
            href: "data:text/json;charset=utf-8," + obj,
            download: "backup.json"
        } );
    } else {
        subject = subject || "OpenSprinkler Data Export on " + dateToString( new Date() );
        var href = "mailto:?subject=" + encodeURIComponent( subject ) + "&body=" + obj;
        $( ele ).attr( "href", href ).on( "click", function() {
            window.open( href );
            return false;
        } );
    }
}

function sortObj( obj, type ) {
    var tempArray = [];

    for ( var key in obj ) {
        if ( obj.hasOwnProperty( key ) ) {
            tempArray.push( key );
        }
    }

    if ( typeof type === "function" ) {
        tempArray.sort( type );
    } else if ( type === "value" ) {
        tempArray.sort( function( a, b ) {
            var x = obj[a];
            var y = obj[b];
            return ( ( x < y ) ? -1 : ( ( x > y ) ? 1 : 0 ) );
        } );
    } else {
        tempArray.sort();
    }

    var tempObj = {};

    for ( var i = 0; i < tempArray.length; i++ ) {
        tempObj[tempArray[i]] = obj[tempArray[i]];
    }

    return tempObj;
}

// Return day of the week
function getDayName( day, type ) {
    var ldays = [ _( "Sunday" ), _( "Monday" ), _( "Tuesday" ), _( "Wednesday" ), _( "Thursday" ), _( "Friday" ), _( "Saturday" ) ],
        sdays = [ _( "Sun" ), _( "Mon" ), _( "Tue" ), _( "Wed" ), _( "Thu" ), _( "Fri" ), _( "Sat" ) ];

    if ( type === "short" ) {
        return sdays[day.getDay()];
    } else {
        return ldays[day.getDay()];
    }
}

// pad a single digit with a leading zero
function pad( number ) {
    var r = String( number );
    if ( r.length === 1 ) {
        r = "0" + r;
    }
    return r;
}

// Escape characters for HTML support
function htmlEscape( str ) {
    return String( str )
        .replace( /&/g, "&amp;" )
        .replace( /"/g, "&quot;" )
        .replace( /'/g, "&#39;" )
        .replace( /</g, "&lt;" )
        .replace( />/g, "&gt;" );
}

//Localization functions
function _( key ) {

    //Translate item (key) based on currently defined language
    if ( typeof language === "object" && language.hasOwnProperty( key ) ) {
        var trans = language[key];
        return trans ? trans : key;
    } else {

        //If English
        return key;
    }
}

function setLang() {

    //Update all static elements to the current language
    $( "[data-translate]" ).text( function() {
        var el = $( this ),
            txt = el.data( "translate" );

        if ( el.is( "input[type='submit']" ) ) {
            el.val( _( txt ) );

            // Update button for jQuery Mobile
            if ( el.parent( "div.ui-btn" ).length > 0 ) {
                el.button( "refresh" );
            }
        } else {
            return _( txt );
        }
    } );
    $( ".ui-toolbar-back-btn" ).text( _( "Back" ) );

    checkCurrLang();
}

function updateLang( lang ) {
    var prefix = "";

    //Empty out the current language (English is provided as the key)
    language = {};

    if ( typeof lang === "undefined" ) {
        storage.get( "lang", function( data ) {

            //Identify the current browser's locale
            var locale = data.lang || navigator.language || navigator.browserLanguage || navigator.systemLanguage || navigator.userLanguage || "en";

            updateLang( locale.substring( 0, 2 ) );
        } );
        return;
    }

    storage.set( { "lang":lang } );
    currLang = lang;

    if ( lang === "en" ) {
        setLang();
        return;
    }

    if ( currLocal ) {
        prefix = $.mobile.path.parseUrl( $( "head" ).find( "script[src$='app.jgz'],script[src$='app.js']" ).attr( "src" ) ).hrefNoHash.slice( 0, -10 );
    }

    $.getJSON( prefix + "locale/" + lang + ".js", function( store ) {
        language = store.messages;
        setLang();
    } ).fail( setLang );
}

function languageSelect() {
    $( "#localization" ).popup( "destroy" ).remove();

	//  {af: _("Afrikaans"), am: _("Amharic"), zh: _("Chinese"), hr: _("Croatian"), cs: _("Czech"),
	//	nl: _("Dutch"), en: _("English"), pes: _("Farsi"), fr: _("French"), de: _("German"),
	//	el: _("Greek"), he: _("Hebrew"), hu: _("Hungarian"), is: _("Icelandic"), it: _("Italian"), lv: _("Latvian"),
	//	mn: _("Mongolian"), no: _("Norwegian"), pl: _("Polish"), pt: _("Portuguese"), ru: _("Russian"),
	//	sk: _("Slovak"), sl: _("Slovenian"), es: _("Spanish"), th: _("Thai")}

    var popup = "<div data-role='popup' data-theme='a' id='localization' data-corners='false'>" +
                "<ul data-inset='true' data-role='listview' id='lang' data-corners='false'>" +
                "<li data-role='list-divider' data-theme='b' class='center' data-translate='Localization'>" + _( "Localization" ) + "</li>",

        codes = { af: "Afrikaans", am: "Amharic", zh: "Chinese", hr: "Croatian", cs: "Czech", nl: "Dutch",
				en: "English", pes: "Farsi", fr: "French", de: "German", el: "Greek", he: "Hebrew", hu: "Hungarian",
				is: "Icelandic", it: "Italian", lv: "Latvian", mn: "Mongolian", no: "Norwegian", pl: "Polish", pt: "Portuguese",
				ru: "Russian", sk: "Slovak", sl: "Slovenian", es: "Spanish", th: "Thai" };

    $.each( codes, function( key, name ) {
        popup += "<li><a href='#' data-translate='" + name + "' data-lang-code='" + key + "'>" + _( name ) + "</a></li>";
    } );

    popup += "</ul></div>";

    popup = $( popup );

    popup.find( "a" ).on( "click", function() {
        var link = $( this ),
            lang = link.data( "lang-code" );

        updateLang( lang );
    } );

    openPopup( popup );

    return false;
}

function checkCurrLang() {
    storage.get( "lang", function( data ) {
        var popup = $( "#localization" );

        popup.find( "a" ).each( function() {
            var item = $( this );
            if ( item.data( "lang-code" ) === data.lang ) {
                item.removeClass( "ui-icon-carat-r" ).addClass( "ui-icon-check" );
            } else {
                item.removeClass( "ui-icon-check" ).addClass( "ui-icon-carat-r" );
            }
        } );

        popup.find( "li.ui-last-child" ).removeClass( "ui-last-child" );
    } );
}

function escapeJSON( json ) {
	return JSON.stringify( json ).replace( /\{|\}/g, "" );
}

function isMD5( pass ) {
    return /^[a-f0-9]{32}$/i.test( pass );
}

function sortByStation( a, b ) {
    if ( a.station < b.station ) {
        return -1;
    } else if ( a.station > b.station ) {
        return 1;
    } else {
        return 0;
    }
}

function minutesToTime( minutes ) {
    var period = minutes > 719 ? "PM" : "AM",
        hour = parseInt( minutes / 60 ) % 12;

    if ( hour === 0 ) {
        hour = 12;
    }

    return hour + ":" + pad( minutes % 60 ) + " " + period;
}

function getTimezoneOffset() {
    var tz = controller.options.tz - 48,
		sign = tz >= 0 ? 1 : -1;

    tz = ( ( Math.abs( tz ) / 4 >> 0 ) * 60 ) + ( ( Math.abs( tz ) % 4 ) * 15 / 10 >> 0 ) + ( ( Math.abs( tz ) % 4 ) * 15 % 10 );
    return tz * sign;
}

function dateToString( date, toUTC, shorten ) {
    var dayNames = [ _( "Sun" ), _( "Mon" ), _( "Tue" ),
					_( "Wed" ), _( "Thr" ), _( "Fri" ), _( "Sat" ) ],
        monthNames = [ _( "Jan" ), _( "Feb" ), _( "Mar" ), _( "Apr" ), _( "May" ), _( "Jun" ),
					_( "Jul" ), _( "Aug" ), _( "Sep" ), _( "Oct" ), _( "Nov" ), _( "Dec" ) ];

	if ( date.getTime() === 0 ) {
		return "--";
	}

    if ( toUTC !== false ) {
        date.setMinutes( date.getMinutes() + date.getTimezoneOffset() );
    }

    if ( currLang === "de" ) {
        return pad( date.getDate() ) + "." + pad( date.getMonth() + 1 ) + "." +
				date.getFullYear() + " " + pad( date.getHours() ) + ":" +
				pad( date.getMinutes() ) + ":" + pad( date.getSeconds() );
    } else {
        if ( shorten ) {
            return monthNames[date.getMonth()] + " " + pad( date.getDate() ) + ", " +
					date.getFullYear() + " " + pad( date.getHours() ) + ":" +
					pad( date.getMinutes() ) + ":" + pad( date.getSeconds() );
        } else {
            return dayNames[date.getDay()] + ", " + pad( date.getDate() ) + " " +
					monthNames[date.getMonth()] + " " + date.getFullYear() + " " +
					pad( date.getHours() ) + ":" + pad( date.getMinutes() ) + ":" +
					pad( date.getSeconds() );
        }
    }
}
