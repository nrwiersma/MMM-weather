/* global Log, Module, moment, config */
/* Magic Mirror
 * Module: MMM-weather
 */

Module.register("MMM-weather",{

	// Default module config.
	defaults: {
		location: false,
		locationID: false,
		appid: "",
		units: config.units,
		updateInterval: 10 * 60 * 1000, // every 10 minutes
		animationSpeed: 1000,
		lang: config.language,
		fade: true,
		fadePoint: 0.25, // Start on 1/4th of the list.

		initialLoadDelay: 2500, // 2.5 seconds delay. This delay is used to keep the OpenWeather API happy.
		retryDelay: 2500,

		apiVersion: "2.5",
		apiBase: "https://api.openweathermap.org/data/",
		currentEndpoint: "weather",
		forecastEndpoint: "forecast/daily",

		iconTable: {
			"01d": "wu-clear",
			"02d": "wu-partlycloudy",
			"03d": "wu-cloudy",
			"04d": "wu-cloudy",
			"09d": "wu-flurries",
			"10d": "wu-rain",
			"11d": "wu-tstorms",
			"13d": "wu-snow",
			"50d": "wu-fog",
			"01n": "wu-clear wu-night",
			"02n": "wu-partlycloudy wu-night",
			"03n": "wu-cloudy wu-night",
			"04n": "wu-cloudy wu-night",
			"09n": "wu-flurries wu-night",
			"10n": "wu-rain wu-night",
			"11n": "wu-tstorms wu-night",
			"13n": "wu-snow wu-night",
			"50n": "wu-fog wu-night",
		},
	},

	// Define required scripts.
	getScripts: function() {
		return ["moment.js"];
	},

	// Define required scripts.
	getStyles: function() {
		return ["wu-icons-style.min.css", "MMM-weather.css"];
	},

	// Define required translations.
	getTranslations: function() {
		// The translations for the default modules are defined in the core translation files.
		// Therefor we can just return false. Otherwise we should have returned a dictionary.
		// If you're trying to build yiur own module including translations, check out the documentation.
		return false;
	},

	// Define start sequence.
	start: function() {
		Log.info("Starting module: " + this.name);

		// Set locale.
		moment.locale(config.language);

		this.loadedData = {};
		this.current = {};
		this.forecast = [];
		this.loaded = false;
		this.scheduleUpdate(this.config.initialLoadDelay);

		this.updateTimer = null;

	},

	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		if (this.config.appid === "") {
			wrapper.innerHTML = "Please set the correct openweather <i>appid</i> in the config for module: " + this.name + ".";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (!this.loaded) {
			wrapper.innerHTML = this.translate("LOADING");
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		var currentWrapper = document.createElement("div");
		var forecastWrapper = document.createElement("div");
		// Style Wrappers
		currentWrapper.className = "current";
		forecastWrapper.className = "forecast";

		// Current weather
		var currIcon = document.createElement("span");
		currIcon.className = "icon wu wu-white "  + this.current.icon;
		currentWrapper.appendChild(currIcon);

		var currTemp = document.createElement("span");
		currTemp.className = "temp bright light";
		currTemp.innerHTML = this.current.temp + "<sup>&deg;</sup>";
		currentWrapper.appendChild(currTemp);

		infoWrapper = document.createElement("span");
		infoWrapper.className = "info semi-bright light";
		infoWrapper.append(this.createInfoWrapper("Max", this.current.maxTemp, "&deg;"))
		infoWrapper.append(this.createInfoWrapper("Min", this.current.minTemp, "&deg;"))
		infoWrapper.append(this.createInfoWrapper("Rain", this.current.rain, "mm"))
		currentWrapper.appendChild(infoWrapper);

		// Forecast
		for (var f in this.forecast) {
			var forecast = this.forecast[f];

			var forecastSpan = document.createElement("span");

			var day = document.createElement("div");
			day.className = "day semi-bright small";
			day.innerHTML = forecast.day;
			forecastSpan.append(day);

			var icon = document.createElement("div");
			icon.className = "icon wu wu-white " + forecast.icon;
			forecastSpan.append(icon);

			var temp = document.createElement("div");
			temp.className = "temp-range semi-bright small";
			temp.innerHTML = forecast.maxTemp + "<sup>&deg;</sup> - " + forecast.minTemp + "<sup>&deg;</sup>";
			forecastSpan.append(temp);

			forecastWrapper.append(forecastSpan);
		}

		wrapper.appendChild(currentWrapper);
		wrapper.appendChild(forecastWrapper);
		return wrapper;
	},

	/* createInfoWrapper(name, value, unit)
	 * Create an info data wrapper.
	 */
	createInfoWrapper: function(name, value, unit) {
		var wrapper = document.createElement("div");

		var typeSpan = document.createElement("span");
		typeSpan.className = "type";
		typeSpan.innerHTML = name + ":";
		wrapper.append(typeSpan);

		wrapper.innerHTML += " " + value;

		var unitSpan = document.createElement("span");
		unitSpan.className = "unit";
		unitSpan.innerHTML = " " + unit;
		wrapper.append(unitSpan);

		return wrapper;
	},

	// Override getHeader method.
	getHeader: function() {
		return this.data.header;
	},

	// Override notification handler.
	notificationReceived: function(notification, payload, sender) {
		if (notification === "DOM_OBJECTS_CREATED") {
			if (this.config.appendLocationNameToHeader) {
				this.hide(0, {lockString: this.identifier});
			}
		}
	},

	/* updateWeather(compliments)
	 * Requests new data from openweather.org.
	 * Calls processWeather on succesfull response.
	 */
	updateWeather: function() {
		if (this.config.appid === "") {
			Log.error("WeatherForecast: APPID not set!");
			return;
		}

		this.loadedData = {};

		var self = this;

		var currentUrl = this.config.apiBase + this.config.apiVersion + "/" + this.config.currentEndpoint + this.getParams();
		var currentRequest = new XMLHttpRequest();
		currentRequest.open("GET", currentUrl, true);
		currentRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					self.loadedData.current = JSON.parse(this.response);
					self.processWeather();
				} else if (this.status === 401) {
					self.updateDom(self.config.animationSpeed);
				} else {
					Log.error(self.name + ": Could not load weather.");
				}

				self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
			}
		};
		currentRequest.send();

		var forecastUrl = this.config.apiBase + this.config.apiVersion + "/" + this.config.forecastEndpoint + this.getParams() + "&cnt=4";
		var forecastRequest = new XMLHttpRequest();
		forecastRequest.open("GET", forecastUrl, true);
		forecastRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					self.loadedData.forecast = JSON.parse(this.response);
					self.processWeather();
				} else if (this.status === 401) {
					self.updateDom(self.config.animationSpeed);
				} else {
					Log.error(self.name + ": Could not load weather.");
				}

				self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
			}
		};
		forecastRequest.send();
	},

	/* getParams(compliments)
	 * Generates an url with api parameters based on the config.
	 *
	 * return String - URL params.
	 */
	getParams: function() {
		var params = "?";
		if(this.config.locationID) {
			params += "id=" + this.config.locationID;
		} else if(this.config.location) {
			params += "q=" + this.config.location;
		} else {
			this.hide(this.config.animationSpeed, {lockString:this.identifier});
			return;
		}

		params += "&units=" + this.config.units;
		params += "&lang=" + this.config.lang;
		params += "&APPID=" + this.config.appid;

		return params;
	},

	/* processWeather()
	 * Uses the received data to set the various values.
	 *
	 * argument data object - Weather information received form openweather.org.
	 */
	processWeather: function() {
		if (this.loadedData.current == null || this.loadedData.forecast == null) {
			return;
		}

		var current = this.loadedData.current;
		this.current = {
			icon: this.config.iconTable[current.weather[0].icon],
			temp: this.roundValue(current.main.temp),
			maxTemp: this.roundValue(current.main.temp_max),
			minTemp: this.roundValue(current.main.temp_min),
			rain: this.roundValue(this.loadedData.forecast.list[0].rain),
		}

		this.forecast = [];
		var lastDay = null;
		var forecastData = {}

		for (var i = 1, count = this.loadedData.forecast.list.length; i < count; i++) {
			var forecast = this.loadedData.forecast.list[i];

			var forecastData = {
				day: moment(forecast.dt, "X").format("dddd"),
				icon: this.config.iconTable[forecast.weather[0].icon],
				maxTemp: this.roundValue(forecast.temp.max),
				minTemp: this.roundValue(forecast.temp.min),
			};

			this.forecast.push(forecastData);
		}

		//Log.log(this.forecast);
		this.show(this.config.animationSpeed, {lockString:this.identifier});
		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
	},

	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		clearTimeout(this.updateTimer);
		this.updateTimer = setTimeout(function() {
			self.updateWeather();
		}, nextLoad);
	},

	/* function(temperature)
	 * Rounds a temperature to 1 decimal or integer (depending on config.roundTemp).
	 *
	 * argument temperature number - Temperature.
	 *
	 * return string - Rounded Temperature.
	 */
	roundValue: function(temperature) {
		if (isNaN(temperature)) {
			return 0;
		}
		return parseFloat(temperature).toFixed(0);
	}
});
