mapboxgl.accessToken = 'pk.eyJ1Ijoia2FsczM0IiwiYSI6ImNtYmQ5b3d6eTFibmIyam9rc212aHhxdnkifQ.B_hr2WjbOr2Z14Tyd48fqw';

const pointStartCoords = [107.4639851, -6.3488325]; // Titik Awal

const pointBranch1Coords = [107.311487, -6.338737];    // Telukjambe
const pointBranch2Coords = [107.2142042, -6.3488988];   // Bekasi
const pointBranch3Coords = [107.0910, -6.2650];    // Pasar Cibitung
const pointBranch4Coords = [107.0600, -6.2500];    // Tambun 
const pointBranch5Coords = [107.4000, -6.3800];    // Pasir Kembang

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [107.25, -6.30],
    zoom: 8.5
});

const lineColor = '#ff0000';


function createCurvedRouteFeature(startCoords, endCoords, curveFactor = 0.3, resolution = 10000, sharpness = 0.85) {
    const line = turf.lineString([startCoords, endCoords]);
    const length = turf.length(line, { units: 'kilometers' });

    // Jika jarak terlalu pendek, kembalikan garis lurus untuk menghindari bentuk aneh
    if (length < 0.1) { // Threshold jarak, bisa disesuaikan
        return {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': [startCoords, endCoords]
            }
        };
    }

    const midpoint = turf.midpoint(turf.point(startCoords), turf.point(endCoords));
    const bearing = turf.bearing(turf.point(startCoords), turf.point(endCoords));

    // Arah offset tegak lurus dari bearing utama
    // curveFactor > 0 akan melengkung ke kiri (bearing - 90)
    // curveFactor < 0 akan melengkung ke kanan (bearing + 90)
    const perpendicularBearing = bearing + (curveFactor > 0 ? -90 : 90);

    // Jarak offset dari midpoint, dikontrol oleh absolut dari curveFactor
    const offsetDistance = length * Math.abs(curveFactor);

    const controlPoint = turf.destination(midpoint, offsetDistance, perpendicularBearing, { units: 'kilometers' }).geometry.coordinates;

    const curvedLine = turf.bezierSpline(turf.lineString([startCoords, controlPoint, endCoords]), {
        resolution: resolution,
        sharpness: sharpness
    });

    return {
        'type': 'Feature',
        'properties': {},
        'geometry': curvedLine.geometry
    };
}

const routes = [
    // Sesuaikan nilai curveFactor agar garis tidak tumpang tindih dan terlihat rapi
    createCurvedRouteFeature(pointStartCoords, pointBranch1Coords, 0.25),  // Telukjambe
    createCurvedRouteFeature(pointStartCoords, pointBranch2Coords, -0.20), // Peminat Sheepvee (melengkung ke arah berlawanan)
    createCurvedRouteFeature(pointStartCoords, pointBranch3Coords, 0.35),  // Pasar Cibitung
    createCurvedRouteFeature(pointStartCoords, pointBranch4Coords, -0.30), // Tambun
    createCurvedRouteFeature(pointStartCoords, pointBranch5Coords, 0.15)   // Pasir Kembang
];

const animationDuration = 20000;

function getInitialBearing(routeFeature) {
    const coords = routeFeature.geometry.coordinates;
    if (coords.length >= 2) {
        const p1 = turf.point(coords[0]);
        const p2 = turf.point(coords[1]); // Ambil titik kedua dari kurva untuk bearing awal
        return turf.bearing(p1, p2);
    }
    return 0;
}

function animateBranch(timestamp, routeFeature, routeSourceId, airplaneSourceId, animationStartTimeRef) {
    if (animationStartTimeRef.value === undefined) {
        animationStartTimeRef.value = timestamp;
    }
    const elapsedTime = timestamp - animationStartTimeRef.value;
    let progress = Math.min(elapsedTime / animationDuration, 1);

    const totalDistance = turf.length(routeFeature, { units: 'kilometers' });
    const currentDistance = totalDistance * progress;

    let partialLineGeoJSON;
    let airplaneCoords = routeFeature.geometry.coordinates[0];
    let currentBearing = getInitialBearing(routeFeature);

    if (progress === 0) {
        partialLineGeoJSON = turf.lineString([routeFeature.geometry.coordinates[0], routeFeature.geometry.coordinates[0]]);
    } else if (progress < 1 && currentDistance > 0) {
        // turf.lineSliceAlong bisa error jika start atau end distance di luar range
        // atau jika LineString terlalu pendek/tidak valid.
        try {
            partialLineGeoJSON = turf.lineSliceAlong(routeFeature, 0, currentDistance, { units: 'kilometers' });
            const coords = partialLineGeoJSON.geometry.coordinates;
            if (coords.length > 0) {
                airplaneCoords = coords[coords.length - 1];
                if (coords.length >= 2) {
                    const prevPoint = turf.point(coords[coords.length - 2]);
                    const currentPoint = turf.point(airplaneCoords);
                    currentBearing = turf.bearing(prevPoint, currentPoint);
                }
            }
        } catch (e) {
            console.warn("Error in turf.lineSliceAlong, using full line as fallback for partial: ", e);
            // Fallback jika lineSliceAlong gagal, misalnya karena kurva yang sangat pendek atau kompleks
            partialLineGeoJSON = turf.feature(routeFeature.geometry);
            const coords = routeFeature.geometry.coordinates;
            if (coords.length > 0) {
                airplaneCoords = coords[coords.length - 1];
                if (coords.length >= 2) {
                    currentBearing = turf.bearing(turf.point(coords[coords.length - 2]), turf.point(airplaneCoords));
                }
            }
        }
    } else { // progress >= 1
        partialLineGeoJSON = turf.feature(routeFeature.geometry);
        const coords = routeFeature.geometry.coordinates;
        if (coords.length > 0) {
            airplaneCoords = coords[coords.length - 1];
            if (coords.length >= 2) {
                const prevPoint = turf.point(coords[coords.length - 2]);
                const currentPoint = turf.point(coords[coords.length - 1]);
                currentBearing = turf.bearing(prevPoint, currentPoint);
            }
        }
    }

    if (map.getSource(routeSourceId)) {
        map.getSource(routeSourceId).setData(partialLineGeoJSON);
    }
    if (map.getSource(airplaneSourceId)) {
        map.getSource(airplaneSourceId).setData({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: airplaneCoords },
            properties: { bearing: currentBearing }
        });
    }

    if (progress < 1) {
        requestAnimationFrame((ts) => animateBranch(ts, routeFeature, routeSourceId, airplaneSourceId, animationStartTimeRef));
    }
}

map.on('load', () => {
    Promise.all([
        new Promise((resolve, reject) => {
            map.loadImage(
                'asset/location_utama.png', // PASTIKAN PATH INI BENAR
                (error, image) => {
                    if (error) {
                        console.error('Gagal memuat gambar marker lokasi utama:', error);
                        return reject(error);
                    }
                    if (!map.hasImage('marker-utama')) map.addImage('marker-utama', image, { sdf: true }); // sdf: true jika ingin mewarnai via paint
                    resolve();
                }
            );
        }),
        new Promise((resolve, reject) => {
            map.loadImage(
                'asset/location_tujuan.png', // PASTIKAN PATH INI BENAR
                (error, image) => {
                    if (error) {
                        console.error('Gagal memuat gambar marker lokasi tujuan:', error);
                        return reject(error);
                    }
                    if (!map.hasImage('marker-tujuan')) map.addImage('marker-tujuan', image, { sdf: true });
                    resolve();
                }
            );
        }),
        new Promise((resolve, reject) => {
            map.loadImage(
                'asset/logo_sheepvee.png', // PASTIKAN PATH INI BENAR
                (error, image) => {
                    if (error) {
                        console.error('GAGAL MEMUAT GAMBAR PESAWAT:', error);
                        return reject(error);
                    }
                    if (!map.hasImage('airplane-icon')) map.addImage('airplane-icon', image);
                    resolve();
                }
            );
        })
    ]).then(() => {
        const animationRefs = [];

        routes.forEach((route, index) => {
            const routeSourceId = `route-line-${index + 1}`;
            const airplaneSourceId = `airplane-point-${index + 1}`;
            const layerId = `route-line-layer-${index + 1}`;
            const airplaneLayerId = `airplane-layer-${index + 1}`;

            map.addSource(routeSourceId, {
                'type': 'geojson',
                // Data awal adalah garis sangat pendek di titik start, akan diupdate oleh animasi
                'data': turf.lineString([pointStartCoords, pointStartCoords])
            });
            map.addLayer({
                'id': layerId,
                'type': 'line',
                'source': routeSourceId,
                'layout': { 'line-join': 'round', 'line-cap': 'round' },
                'paint': { 'line-color': lineColor, 'line-width': 5, 'line-opacity': 0.75 }
            });

            const initialBearing = getInitialBearing(route);
            map.addSource(airplaneSourceId, {
                'type': 'geojson',
                'data': { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointStartCoords }, 'properties': { 'bearing': initialBearing } }
            });
            map.addLayer({
                'id': airplaneLayerId,
                'type': 'symbol',
                'source': airplaneSourceId,
                'layout': { 'icon-image': 'airplane-icon', 'icon-size': 0.25, 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-rotate': ['get', 'bearing'], 'icon-rotation-alignment': 'map' }
            });

            animationRefs.push({ value: undefined });
        });

        const pointFeatures = [
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointStartCoords }, 'properties': { 'title': ' Peternakan Sheepvee', 'markerType': 'utama' } },
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointBranch1Coords }, 'properties': { 'title': 'Peminat Sheepvee', 'markerType': 'tujuan' } },
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointBranch2Coords }, 'properties': { 'title': 'Peminat Sheepvee', 'markerType': 'tujuan' } },
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointBranch3Coords }, 'properties': { 'title': 'Peminat Sheepvee', 'markerType': 'tujuan' } },
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointBranch4Coords }, 'properties': { 'title': 'Peminat Sheepvee', 'markerType': 'tujuan' } },
            { 'type': 'Feature', 'geometry': { 'type': 'Point', 'coordinates': pointBranch5Coords }, 'properties': { 'title': 'Peminat Sheepvee', 'markerType': 'tujuan' } }
        ];

        map.addSource('branch-points', {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': pointFeatures
            }
        });
        map.addLayer({
            'id': 'branch-points-layer',
            'type': 'symbol',
            'source': 'branch-points',
            'layout': {
                'icon-image': [
                    'match',
                    ['get', 'markerType'],
                    'utama', 'marker-utama',
                    'tujuan', 'marker-tujuan',
                    'marker-tujuan' // Default
                ],
                // Sesuaikan ukuran ikon jika perlu
                'icon-allow-overlap': true,
                'text-field': ['get', 'title'],
                'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
                'text-offset': [0, 1.2], // Sesuaikan offset teks
                'text-anchor': 'top'
            }
        });

        setTimeout(() => {
            routes.forEach((route, index) => {
                const routeSourceId = `route-line-${index + 1}`;
                const airplaneSourceId = `airplane-point-${index + 1}`;
                requestAnimationFrame((ts) => animateBranch(ts, route, routeSourceId, airplaneSourceId, animationRefs[index]));
            });
        }, 500);

    }).catch(error => {
        console.error("Gagal memuat aset untuk peta:", error);
    });
});

// timeline
jQuery(document).ready(function ($) {
    var timelines = $('.cd-horizontal-timeline'),
        eventsMinDistance = 90;

    (timelines.length > 0) && initTimeline(timelines);

    function initTimeline(timelines) {
        timelines.each(function () {
            var timeline = $(this),
                timelineComponents = {};
            //cache timeline components 
            timelineComponents['timelineWrapper'] = timeline.find('.events-wrapper');
            timelineComponents['eventsWrapper'] = timelineComponents['timelineWrapper'].children('.events');
            timelineComponents['fillingLine'] = timelineComponents['eventsWrapper'].children('.filling-line');
            timelineComponents['timelineEvents'] = timelineComponents['eventsWrapper'].find('a');
            timelineComponents['timelineDates'] = parseDate(timelineComponents['timelineEvents']);
            timelineComponents['eventsMinLapse'] = minLapse(timelineComponents['timelineDates']);
            timelineComponents['timelineNavigation'] = timeline.find('.cd-timeline-navigation');
            timelineComponents['eventsContent'] = timeline.children('.events-content');

            //assign a left postion to the single events along the timeline
            setDatePosition(timelineComponents, eventsMinDistance);
            //assign a width to the timeline
            var timelineTotWidth = setTimelineWidth(timelineComponents, eventsMinDistance);
            //the timeline has been initialize - show it
            timeline.addClass('loaded');

            //detect click on the next arrow
            timelineComponents['timelineNavigation'].on('click', '.next', function (event) {
                event.preventDefault();
                updateSlide(timelineComponents, timelineTotWidth, 'next');
            });
            //detect click on the prev arrow
            timelineComponents['timelineNavigation'].on('click', '.prev', function (event) {
                event.preventDefault();
                updateSlide(timelineComponents, timelineTotWidth, 'prev');
            });
            //detect click on the a single event - show new event content
            timelineComponents['eventsWrapper'].on('click', 'a', function (event) {
                event.preventDefault();
                timelineComponents['timelineEvents'].removeClass('selected');
                $(this).addClass('selected');
                updateOlderEvents($(this));
                updateFilling($(this), timelineComponents['fillingLine'], timelineTotWidth);
                updateVisibleContent($(this), timelineComponents['eventsContent']);
            });

            //on swipe, show next/prev event content
            timelineComponents['eventsContent'].on('swipeleft', function () {
                var mq = checkMQ();
                (mq == 'mobile') && showNewContent(timelineComponents, timelineTotWidth, 'next');
            });
            timelineComponents['eventsContent'].on('swiperight', function () {
                var mq = checkMQ();
                (mq == 'mobile') && showNewContent(timelineComponents, timelineTotWidth, 'prev');
            });

            //keyboard navigation
            $(document).keyup(function (event) {
                if (event.which == '37' && elementInViewport(timeline.get(0))) {
                    showNewContent(timelineComponents, timelineTotWidth, 'prev');
                } else if (event.which == '39' && elementInViewport(timeline.get(0))) {
                    showNewContent(timelineComponents, timelineTotWidth, 'next');
                }
            });
        });
    }

    function updateSlide(timelineComponents, timelineTotWidth, string) {
        //retrieve translateX value of timelineComponents['eventsWrapper']
        var translateValue = getTranslateValue(timelineComponents['eventsWrapper']),
            wrapperWidth = Number(timelineComponents['timelineWrapper'].css('width').replace('px', ''));
        //translate the timeline to the left('next')/right('prev') 
        (string == 'next')
            ? translateTimeline(timelineComponents, translateValue - wrapperWidth + eventsMinDistance, wrapperWidth - timelineTotWidth)
            : translateTimeline(timelineComponents, translateValue + wrapperWidth - eventsMinDistance);
    }

    function showNewContent(timelineComponents, timelineTotWidth, string) {
        //go from one event to the next/previous one
        var visibleContent = timelineComponents['eventsContent'].find('.selected'),
            newContent = (string == 'next') ? visibleContent.next() : visibleContent.prev();

        if (newContent.length > 0) { //if there's a next/prev event - show it
            var selectedDate = timelineComponents['eventsWrapper'].find('.selected'),
                newEvent = (string == 'next') ? selectedDate.parent('li').next('li').children('a') : selectedDate.parent('li').prev('li').children('a');

            updateFilling(newEvent, timelineComponents['fillingLine'], timelineTotWidth);
            updateVisibleContent(newEvent, timelineComponents['eventsContent']);
            newEvent.addClass('selected');
            selectedDate.removeClass('selected');
            updateOlderEvents(newEvent);
            updateTimelinePosition(string, newEvent, timelineComponents, timelineTotWidth);
        }
    }

    function updateTimelinePosition(string, event, timelineComponents, timelineTotWidth) {
        //translate timeline to the left/right according to the position of the selected event
        var eventStyle = window.getComputedStyle(event.get(0), null),
            eventLeft = Number(eventStyle.getPropertyValue("left").replace('px', '')),
            timelineWidth = Number(timelineComponents['timelineWrapper'].css('width').replace('px', '')),
            timelineTotWidth = Number(timelineComponents['eventsWrapper'].css('width').replace('px', ''));
        var timelineTranslate = getTranslateValue(timelineComponents['eventsWrapper']);

        if ((string == 'next' && eventLeft > timelineWidth - timelineTranslate) || (string == 'prev' && eventLeft < - timelineTranslate)) {
            translateTimeline(timelineComponents, - eventLeft + timelineWidth / 2, timelineWidth - timelineTotWidth);
        }
    }

    function translateTimeline(timelineComponents, value, totWidth) {
        var eventsWrapper = timelineComponents['eventsWrapper'].get(0);
        value = (value > 0) ? 0 : value; //only negative translate value
        value = (!(typeof totWidth === 'undefined') && value < totWidth) ? totWidth : value; //do not translate more than timeline width
        setTransformValue(eventsWrapper, 'translateX', value + 'px');
        //update navigation arrows visibility
        (value == 0) ? timelineComponents['timelineNavigation'].find('.prev').addClass('inactive') : timelineComponents['timelineNavigation'].find('.prev').removeClass('inactive');
        (value == totWidth) ? timelineComponents['timelineNavigation'].find('.next').addClass('inactive') : timelineComponents['timelineNavigation'].find('.next').removeClass('inactive');
    }

    function updateFilling(selectedEvent, filling, totWidth) {
        //change .filling-line length according to the selected event
        var eventStyle = window.getComputedStyle(selectedEvent.get(0), null),
            eventLeft = eventStyle.getPropertyValue("left"),
            eventWidth = eventStyle.getPropertyValue("width");
        eventLeft = Number(eventLeft.replace('px', '')) + Number(eventWidth.replace('px', '')) / 2;
        var scaleValue = eventLeft / totWidth;
        setTransformValue(filling.get(0), 'scaleX', scaleValue);
    }

    function setDatePosition(timelineComponents, min) {
        var baseSpacing = 200; // Jarak minimal antara titik dalam pixel

        for (i = 0; i < timelineComponents['timelineDates'].length; i++) {
            timelineComponents['timelineEvents'].eq(i).css('left', (i * baseSpacing) + 'px');
        }
    }

    function setTimelineWidth(timelineComponents, width) {
        var timeSpan = daydiff(timelineComponents['timelineDates'][0], timelineComponents['timelineDates'][timelineComponents['timelineDates'].length - 1]),
            timeSpanNorm = timeSpan / timelineComponents['eventsMinLapse'],
            timeSpanNorm = Math.round(timeSpanNorm) + 4,
            totalWidth = timeSpanNorm * width;
        timelineComponents['eventsWrapper'].css('width', totalWidth + 'px');
        updateFilling(timelineComponents['timelineEvents'].eq(0), timelineComponents['fillingLine'], totalWidth);

        return totalWidth;
    }

    function updateVisibleContent(event, eventsContent) {
        var eventDate = event.data('date'),
            visibleContent = eventsContent.find('.selected'),
            selectedContent = eventsContent.find('[data-date="' + eventDate + '"]'),
            selectedContentHeight = selectedContent.height();

        if (selectedContent.index() > visibleContent.index()) {
            var classEnetering = 'selected enter-right',
                classLeaving = 'leave-left';
        } else {
            var classEnetering = 'selected enter-left',
                classLeaving = 'leave-right';
        }

        selectedContent.attr('class', classEnetering);
        visibleContent.attr('class', classLeaving).one('webkitAnimationEnd oanimationend msAnimationEnd animationend', function () {
            visibleContent.removeClass('leave-right leave-left');
            selectedContent.removeClass('enter-left enter-right');
        });
        eventsContent.css('height', selectedContentHeight + 'px');
    }

    function updateOlderEvents(event) {
        event.parent('li').prevAll('li').children('a').addClass('older-event').end().end().nextAll('li').children('a').removeClass('older-event');
    }

    function getTranslateValue(timeline) {
        var timelineStyle = window.getComputedStyle(timeline.get(0), null),
            timelineTranslate = timelineStyle.getPropertyValue("-webkit-transform") ||
                timelineStyle.getPropertyValue("-moz-transform") ||
                timelineStyle.getPropertyValue("-ms-transform") ||
                timelineStyle.getPropertyValue("-o-transform") ||
                timelineStyle.getPropertyValue("transform");

        if (timelineTranslate.indexOf('(') >= 0) {
            var timelineTranslate = timelineTranslate.split('(')[1];
            timelineTranslate = timelineTranslate.split(')')[0];
            timelineTranslate = timelineTranslate.split(',');
            var translateValue = timelineTranslate[4];
        } else {
            var translateValue = 0;
        }

        return Number(translateValue);
    }

    function setTransformValue(element, property, value) {
        element.style["-webkit-transform"] = property + "(" + value + ")";
        element.style["-moz-transform"] = property + "(" + value + ")";
        element.style["-ms-transform"] = property + "(" + value + ")";
        element.style["-o-transform"] = property + "(" + value + ")";
        element.style["transform"] = property + "(" + value + ")";
    }

    //based on http://stackoverflow.com/questions/542938/how-do-i-get-the-number-of-days-between-two-dates-in-javascript
    function parseDate(events) {
        var dateArrays = [];
        events.each(function () {
            var dateComp = $(this).data('date').split('/'),
                newDate = new Date(dateComp[2], dateComp[1] - 1, dateComp[0]);
            dateArrays.push(newDate);
        });
        return dateArrays;
    }

    function parseDate2(events) {
        var dateArrays = [];
        events.each(function () {
            var singleDate = $(this),
                dateComp = singleDate.data('date').split('T');
            if (dateComp.length > 1) { //both DD/MM/YEAR and time are provided
                var dayComp = dateComp[0].split('/'),
                    timeComp = dateComp[1].split(':');
            } else if (dateComp[0].indexOf(':') >= 0) { //only time is provide
                var dayComp = ["2000", "0", "0"],
                    timeComp = dateComp[0].split(':');
            } else { //only DD/MM/YEAR
                var dayComp = dateComp[0].split('/'),
                    timeComp = ["0", "0"];
            }
            var newDate = new Date(dayComp[2], dayComp[1] - 1, dayComp[0], timeComp[0], timeComp[1]);
            dateArrays.push(newDate);
        });
        return dateArrays;
    }

    function daydiff(first, second) {
        return Math.round((second - first));
    }

    function minLapse(dates) {
        //determine the minimum distance among events
        var dateDistances = [];
        for (i = 1; i < dates.length; i++) {
            var distance = daydiff(dates[i - 1], dates[i]);
            dateDistances.push(distance);
        }
        return Math.min.apply(null, dateDistances);
    }

    /*
        How to tell if a DOM element is visible in the current viewport?
        http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport
    */
    function elementInViewport(el) {
        var top = el.offsetTop;
        var left = el.offsetLeft;
        var width = el.offsetWidth;
        var height = el.offsetHeight;

        while (el.offsetParent) {
            el = el.offsetParent;
            top += el.offsetTop;
            left += el.offsetLeft;
        }

        return (
            top < (window.pageYOffset + window.innerHeight) &&
            left < (window.pageXOffset + window.innerWidth) &&
            (top + height) > window.pageYOffset &&
            (left + width) > window.pageXOffset
        );
    }

    function checkMQ() {
        //check if mobile or desktop device
        return window.getComputedStyle(document.querySelector('.cd-horizontal-timeline'), '::before').getPropertyValue('content').replace(/'/g, "").replace(/"/g, "");
    }
}); 