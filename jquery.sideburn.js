(function($) {
/*

EXAMPLE
=======

<ul class="sideburn"
    data-speed="1000"
    data-style="reveal-left"
    data-nav="{style='next', total=true, position='above'}"
>
<li><img src="image1.png"></li>
<li><img src="image2.png"></li>
<li><img src="image3.png"></li>
<li><img src="image4.png"></li>
</ul>

becomes:

<div class="sideburn-wrap">
<div class="sideburn-nav sideburn-nav-next sideburn-nav-above">
    <span class="position"><span class="current">1</span> /
        <span class="total">4</span></span>
    <span class="separator">/</span>
    <span class="previous">Previous</span>
    <span class="separator">/</span>
    <span class="next">Next</span>
</div>
<ul ...>...</ul>
<div class="sideburn-loader">loading...</div>
</div>

GOALS
=====

* Work with unordered lists.

* All settings should be data attributes on the <ul> tag.

* List items can be any html, not just a single image.

* Always preload the next item, preload everything if using thumbnails

* Settings:
    speed (0 instant, default is 500.)
    timeout (0 no-auto, default)
    transition (see below)
    shuffle (default false)
    start (default index or random)
    skipfirstrun (default false)

    nav (json)
        position = above/below
        style = next/jump/thumbnails
        navSeparator (default to /)
        nextText (default to Next)
        previousText (default to Previous)
        showTotal = true/false
        totalSeparator (default to or)
        numbering (1 or 01)
        showAll = true/false
        allText (default to show all)
        oneText (default to show one)


* Events (callbacks?): (TODO)
    - sideburn:initialized
    - sideburn:resized
    - sideburn:switch($previous, $next)
    - sideburn:loading(numberOfImages)
    - sideburn:loadedOne()
    - sideburn:loadingComplete()
    - sideburn:show($item)
    - sideburn:beforeAnimate($previous, $next)
    - sideburn:afterAnimate($previous, $next)

* Sizes should be recalculated on window.resize


TRANSITIONS
===========

fade
----

new one below current, current more and more transparent.


horizontal
----------

slide left (new ones appear from the right, next to current)
slide right (new ones appear from the left, next to current)
slide left and right (images in a horizontal line)
slide left and right wrap (images in a horizontal line, wrap around)
TODO: reveal left (new ones appear from the right, below current)
TODO: reveal right (new ones appear from the left, below current)

vertical
--------

TODO: same as above, but up/down and not left/right

*/


var nextId = 1;
function getNextItemId() {
    // makes up something suitable for an id="" attr on an li tag
    var id = 'sideburn-item-'+nextId;
    nextId += 1;
    return id;
}
function getOrSetItemId($li) {
    // fills in id="" on $li if it doesn't exist, returns it
    if (!$li.attr('id')) {
        $li.attr('id', getNextItemId());
    }
    return $li.attr('id');
}

/*
Plugins govern
    how things animate,
    how the items are placed (next to / on top of each other),
    how the slideshow's height gets calculated
*/
var plugins = {};

var Fade = function(sideburn) {
    this.sideburn = sideburn;
};
Fade.prototype.animate = function($oldItem, $newItem, callback) {
    $oldItem.css({
        'left': this.sideburn.calculateLeft($oldItem),
        'top': this.sideburn.calculateTop($oldItem),
        'z-index': 2,
        'opacity': 1
    });
    $newItem.css({
        'left': this.sideburn.calculateLeft($newItem),
        'top': this.sideburn.calculateTop($newItem),
        'z-index': 1,
        'opacity': 0
    });
    $newItem.show();

    $oldItem.animate({
        'opacity': 0
    }, this.sideburn.speed);

    $newItem.animate({
        'opacity': 1
    }, this.sideburn.speed, function() {
        // cleanup
        $oldItem.hide();
        $oldItem.css({
            'z-index': 1,
            'opacity': 1
        });
        callback();
    });
};
plugins['fade'] = Fade;

var SlideLeft = function(sideburn) {
    this.sideburn = sideburn;
};
SlideLeft.prototype.animate = function($oldItem, $newItem, callback) {
    $oldItem.css({
        'left': this.sideburn.calculateLeft($oldItem),
        'top': this.sideburn.calculateTop($oldItem)
    });
    $newItem.css({
        'left': this.sideburn.calculateLeft($newItem)+$oldItem.width(),
        'top': this.sideburn.calculateTop($newItem)
    });
    $newItem.show();

    $oldItem.animate({
        'left': this.sideburn.calculateLeft($newItem)-$oldItem.width()
    }, this.sideburn.speed);

    $newItem.animate({
        'left': this.sideburn.calculateLeft($newItem)
    }, this.sideburn.speed, function() {
        // cleanup
        $oldItem.hide();
        callback();
    });
};
plugins['slide-left'] = SlideLeft;

var SlideRight = function(sideburn) {
    this.sideburn = sideburn;
};
SlideRight.prototype.animate = function($oldItem, $newItem, callback) {
    $oldItem.css({
        'left': this.sideburn.calculateLeft($oldItem),
        'top': this.sideburn.calculateTop($oldItem)
    });
    $newItem.css({
        'left': this.sideburn.calculateLeft($newItem)-$newItem.width(),
        'top': this.sideburn.calculateTop($newItem)
    });
    $newItem.show();

    $oldItem.animate({
        'left': this.sideburn.calculateLeft($oldItem)+$newItem.width()
    }, this.sideburn.speed);

    $newItem.animate({
        'left': this.sideburn.calculateLeft($newItem)
    }, this.sideburn.speed, function() {
        // cleanup
        $oldItem.hide();
        callback();
    });
};
plugins['slide-right'] = SlideRight;

function makeLinearIncrements(total, numSteps) {
    var steps = [],
        increment = total/numSteps;
    for (var i=0; i<numSteps; i++) {
        steps.push(increment);
    }
    return steps;
};

var horizontalSlideStep = function(plugin) {
    if (plugin.current == plugin.destination) {
        return plugin.callback();
    }

    var next = plugin.current+plugin.direction,
        numItems = plugin.sideburn.items.length;

    while (next < 0) {
        next += numItems;
    }
    while (next >= numItems) {
        next -= numItems;
    }

    var $oldItem = plugin.sideburn.items.eq(plugin.current),
        $newItem = plugin.sideburn.items.eq(next),
        speed = plugin.speedIncrements.shift(),
        easing = (plugin.numSteps == 1) ? 'swing' : 'linear';


    if (plugin.direction == 1) {
        // left
        $oldItem.css({
            'left': plugin.sideburn.calculateLeft($oldItem),
            'top': plugin.sideburn.calculateTop($oldItem)
        });
        $newItem.css({
            'left': plugin.sideburn.calculateLeft($newItem)+$oldItem.width(),
            'top': plugin.sideburn.calculateTop($newItem)
        });
        $newItem.show();

        $oldItem.animate({
            'left': plugin.sideburn.calculateLeft($newItem)-$oldItem.width()
        }, speed, easing);

        $newItem.animate({
            'left': plugin.sideburn.calculateLeft($newItem)
        }, speed, easing, function() {
            // cleanup
            $oldItem.hide();
            plugin.current = next;
            plugin.step();
        });

    } else {
        // right
        $oldItem.css({
            'left': plugin.sideburn.calculateLeft($oldItem),
            'top': plugin.sideburn.calculateTop($oldItem)
        });
        $newItem.css({
            'left': plugin.sideburn.calculateLeft($newItem)-$newItem.width(),
            'top': plugin.sideburn.calculateTop($newItem)
        });
        $newItem.show();

        $oldItem.animate({
            'left': plugin.sideburn.calculateLeft($oldItem)+$newItem.width()
        }, speed, easing);

        $newItem.animate({
            'left': plugin.sideburn.calculateLeft($newItem)
        }, speed, easing, function() {
            // cleanup
            $oldItem.hide();
            plugin.current = next;
            plugin.step();
        });
    }
};

SlideLeftRight = function(sideburn) {
    this.sideburn = sideburn;
    this.current = null
    this.destination = null;
    this.direction = null;
    this.numSteps = null;
    this.speedIncrements = [];
    this.callback = null;
};
SlideLeftRight.prototype.animate = function($oldItem, $newItem, callback) {
    var oldIndex = this.sideburn.items.index($oldItem),
        newIndex = this.sideburn.items.index($newItem),
        numItems = this.sideburn.items.length,
        lastIndex = numItems-1,
        diff,
        numSteps;

    diff = newIndex-oldIndex;
    numSteps = Math.abs(diff);
    this.current = oldIndex;
    this.destination = newIndex;
    this.direction = (diff > 0) ? 1 : -1;
    this.numSteps = numSteps;
    this.speedIncrements = makeLinearIncrements(this.sideburn.speed, numSteps);

    this.callback = callback;
    this.step();
};
SlideLeftRight.prototype.step = function() {
    horizontalSlideStep(this);
};
plugins['slide-left-right'] = SlideLeftRight;

SlideLeftRightWrap = function(sideburn) {
    this.sideburn = sideburn;
    this.current = null
    this.destination = null;
    this.direction = null;
    this.numSteps = null;
    this.speedIncrements = [];
    this.callback = null;
};
SlideLeftRightWrap.prototype.animate = function($oldItem, $newItem, callback) {
    var oldIndex = this.sideburn.items.index($oldItem),
        newIndex = this.sideburn.items.index($newItem),
        numItems = this.sideburn.items.length,
        lastIndex = numItems-1,
        numSteps;

    if (newIndex>oldIndex) {
        if (oldIndex == 0 && newIndex == lastIndex) {
            // at the start going to the end
            this.direction = -1;
            numSteps = 1;
        } else {
            // just going right as normal
            this.direction = 1;
            numSteps = Math.abs(newIndex-oldIndex);
        }
    } else {
        if (oldIndex == lastIndex && newIndex == 0) {
            // at the end going to the front
            this.direction = 1;
            numSteps = 1;
        } else {
            // just going left as normal
            this.direction = -1
            numSteps = Math.abs(newIndex-oldIndex);
        }
    }
    this.current = oldIndex;
    this.destination = newIndex;
    this.numSteps = numSteps;
    this.speedIncrements = makeLinearIncrements(this.sideburn.speed, numSteps);
    this.callback = callback;
    this.step();
};
SlideLeftRightWrap.prototype.step = function() {
    horizontalSlideStep(this);
};
plugins['slide-left-right-wrap'] = SlideLeftRightWrap;

/*
plugins['reveal-left']
plugins['reveal-right']
plugins['slide-up']
plugins['slide-down']
plugins['reveal-up']
plugins['reveal-down']
plugins['slide-up-down']
plugins['slide-up-down-wrap']
*/

function detectPlugin(name) {
    var plugin = plugins['slide-left-right-wrap'];
    if (plugins[name]) {
        plugin = plugins[name];
    }
    return plugin;
}

var Sideburn = function($ul) {
    var sideburn = this;

    this.currentIndex = 0;
    this.resizing = false;
    this.resizefunc = null;
    this.firstRun = true;
    this.skipFirstRun = false;
    this.busyShowing = false;
    //this.resized = false;
    this.pause = false;
    this.justPaused = false;

    // the ul must have overflow: hidden and position: relative
    this.ul = $ul;
    this.ul
        .css('overflow', 'hidden')
        .css('position', 'relative');

    // add a wrapper if one doesn't exist yet
    this.wrap = this.ul.parent('div.sideburn-wrap');
    if (!this.wrap.length) {
        this.ul.wrap('<div class="sideburn-wrap"></div>');
        this.wrap = this.ul.parent();
    }
    this.wrap.css('position', 'relative');

    // add a preload div
    this.preload = this.wrap.find('> .sideburn-loader');
    if (!this.preload.length) {
        this.wrap.prepend(
            '<div class="sideburn-loader">loading...</div>');
        this.preload = this.wrap.find('> .sideburn-loader');
    }
    this.preload.css({
        'position': 'absolute',
        'z-index': 2,
        'top': 0,
        'left': 0
    });

    // get the items
    this.items = this.ul.find('> li');
    this.numItems = this.items.length;
    this.images = this.ul.find('> li img');
    this.imagesonly = this.ul.find('> li > img:only-child');

    // src, width, height, loaded, etc. for each image url
    this.preloadCache = {};
    this.images.each(function() {
        var img = this,
            $img = $(this),
            obj = {},
            complete;

        obj.src = $img.attr('src');
        if (img.attributes.width && img.attributes.height) {
            // Don't trust jquery or the dom here.
            // Long story related to responsive css and
            // browser image resizing..
            // BUT this will only come into play if preloading is optional
            // and we don't support that yet.
            obj.width = parseInt(img.attributes.width.nodeValue, 10);
            obj.height = parseInt(img.attributes.height.nodeValue, 10);
        } else {
            obj.width = obj.height = null;
        }
        obj.complete = img.complete;
        if (!obj.complete) {
            $img.load(function() {
                obj.complete = true;
            });
        }
        sideburn.preloadCache[obj.src] = obj;
    });

    // For each li tag, we extract the src="" attributes for all the images
    // and store it in urlCache according to the li tag's id
    this.urlCache = {};
    this.items.each(function() {
        var $li = $(this);
        var urls = [];
        $li.find('img').each(function() {
            urls.push($(this).attr('src'));
        });
        sideburn.urlCache[getOrSetItemId($li)] = urls;
    });

    // load in the settings
    this.speed = 500;
    if (this.ul.data('speed') || this.ul.data('speed') == 0) {
        var speed = parseInt(this.ul.data('speed'), 10);
        if (speed >= 0) {
            this.speed = speed;
        }
    }
    this.timeout = 0;
    if (this.ul.data('timeout')) {
        var timeout = parseInt(this.ul.data('timeout'), 10);
        if (timeout > 0) {
            this.timeout = timeout;
        }
    }
    this.nav = false;
    if (this.ul.data('nav')) {
        var nav = this.ul.data('nav');
        this.nav = {
            position: 'above',
            style: 'next',
            navSeparator: nav.navSeparator || '/',
            nextText: nav.nextText || 'Next',
            previousText: nav.previousText || 'Previous',
            showTotal: (nav.showTotal) ? true : false,
            totalSeparator: nav.totalSeparator || ' or ',
            numbering: '1',
            showAll: (nav.showAll) ? true : false,
            allText: nav.allText || 'Show all',
            oneText: nav.oneText || 'Show one'
        };
        if (['next', 'jump', 'thumbnails'].indexOf(nav.style) != -1) {
            this.nav.style = nav.style
        }
        if (nav.position == 'below') {
            this.nav.position = 'below';
        }
        if (nav.numbering == '01') {
            this.nav.numbering = '01';
        }
    }
    this.shuffle = (this.ul.data('shuffle')) ? true : false;
    if (this.shuffle) {
        // TODO: shuffle the items, rebuild them
    }
    if (this.ul.data('start')) {
        var start = this.ul.data('start');
        if (start == 'random') {
            this.currentIndex = Math.floor(Math.random()*this.numItems);
        } else {
            if (start > 0 && start < this.numItems) {
                this.currentIndex = start;
            }
        }
    } else {
        var filtered = this.items.filter('.start');
        if (filtered.length) {
            this.currentIndex = this.items.index(filtered);
        }
    }
    // the animation that plays after preloading
    this.skipFirstRun = (this.ul.data('skipfirstrun')) ? true : false;

    // add the navigation div if there should be nav (start out hidden)
    this.wrap.find('> .sideburn-nav').remove();
    if (this.nav) {
        var html = '';
        html += '<div class="sideburn-nav sideburn-nav-'+this.nav.style+
        ' sideburn-nav-'+this.nav.position+'">';
        if (this.nav.style == 'next') {
            if (this.nav.showTotal) {
                html += '<span class="position">';
                html += '<span class="current">'+(this.currentIndex+1)+
                    '</span>'+this.nav.totalSeparator;
                html += '<span class="total">'+this.numItems+'</span>';
                html += '</span> ';
                html += '<span class="separator">'+this.nav.navSeparator+
                    '</span> ';
                html += '</span>'; // close position
            }
            html += '<span class="previous">'+this.nav.previousText+'</span> ';
            html += '<span class="separator">'+this.nav.navSeparator+
                '</span> ';
            html += '<span class="next">'+this.nav.nextText+'</span>';
            if (this.nav.showAll) {
                html += ' <span class="separator">'+this.nav.navSeparator+
                    '</span> ';
                html += ' <span class="toggleall">';
                html += '<span class="all">'+this.nav.allText+'</span> ';
                html += '<span class="one">'+this.nav.oneText+'</span>';
                html += '</span>'; // close toggleall
            }
        }
        if (nav.style == 'jump') {
            var label,
                selected,
                bits = [],
                parts;
            for (var i=0; i<this.numItems; i++) {
                label = (i+1)+'';
                if (this.nav.numbering == '01' && label.length < 2) {
                    label = '0'+''+label;
                }
                selected = '';
                selected = (i == this.currentIndex) ? ' selected' : '';
                parts = [];
                parts.push('<span class="jump'+selected+'" data-index="'+i+
                    '">');
                parts.push(label);
                parts.push('</span>');
                bits.push(parts.join(''));
            }
            html += bits.join(' <span class="separator">'+
                this.nav.navSeparator+'</span> ');
        }
        if (nav.style == 'thumbnails') {
            var selected,
                bits = [];
            bits.push('<ul class="thumbnails">');
            for (var i=0; i<this.numItems; i++) {
                selected = (i == this.currentIndex) ? ' class="selected"' : '';
                bits.push('<li data-index="'+i+'"'+selected+'>');
                var $li = this.items.eq(i);
                var $img = $li.find('> img');
                if ($img.length) {
                    bits.push($li.html());
                } else {
                    bits.push(i+1); // fallback to the number
                }
                bits.push('</li>');
            }
            bits.push('</ul>');
            html += bits.join('');
        }
        html += '</div>';
        if (this.nav.position == 'above') {
            this.wrap.prepend(html);
        } else {
            this.wrap.append(html);
        }
        this.nav.element = this.wrap.find('> .sideburn-nav');
        if (this.nav.showTotal) {
            this.nav.currentElement = this.nav.element.find('.current');
        }
        this.nav.element.find('.previous').click(function() {
            sideburn.previous();
        });
        this.nav.element.find('.next').click(function() {
            sideburn.next();
        });
        this.nav.element.find('.all').click(function() {
            sideburn.all();
        });
        this.nav.element.find('.one').click(function() {
            sideburn.one();
        });
        this.nav.element.find('.jump').click(function() {
            sideburn.show($(this).data('index'));
        });
        this.nav.element.find('.thumbnails li').click(function() {
            sideburn.show($(this).data('index'));
        });
    }

    var Plugin = detectPlugin(this.ul.data('transition'));
    this.plugin = new Plugin(sideburn);

    // install click handlers on images directly inside list
    if (this.timeout) {
        this.imagesonly.click(function() {
            if (sideburn.pause) {
                sideburn.pause = false;
                sideburn.next();
            } else {
                sideburn.pause = true;
                sideburn.justPaused = true;
            }
        });
    } else {
        this.imagesonly.click(function() {
            sideburn.next();
        });
    }

    // hide everything, make it all absolute positioned
    // and on top of each other
    this.items
        .hide()
        .css({
            'position': 'absolute',
            'left': 0,
            'top': 0,
            'z-index': 1
        });

    var width = this.wrap.width();

    this.items.width(width);
    this.ul.width(width);

    if (this.plugin.init) {
        this.plugin.init();
    }

    if (window._) {
        var resizefunc = this.resizefunc = _.debounce(function() {
            sideburn.recalculateSize();
        }, 500);
        $(window).resize(resizefunc);
    }

    this.show(this.currentIndex);
};
Sideburn.prototype.recalculateSize = function(immediate) {
    var w = this.wrap.width();
    if (!w) {
        return; // the slideshow is probably not visible
    }
    this.items.width(w);
    this.preload.width(w);
    var speed = this.speed;
    if (immediate) {
        speed = 0;
    }
    this._adjustDimensions(this.currentIndex, speed);
};
Sideburn.prototype.getId = function(index) {
    return this.items.eq(index).attr('id');
};
Sideburn.prototype.getUrls = function(index) {
    // pull the urls for the item at index out of the cache
    return this.urlCache[this.getId(index)] || [];
};
Sideburn.prototype.getUncachedUrls = function(urls) {
    var uncached = [];
    for (var i in urls) {
        var url = urls[i];
        var obj = this.preloadCache[url];
        if (obj && !obj.complete) {
            uncached.push(url);
        }
    }
    return uncached;
};
Sideburn.prototype.getAllUncachedUrls = function() {
    var uncached = [];
    for (var i=0; i<numItems; i++) {
        var urls = this.getUrls(i);
        var more = this.getUncachedUrls(urls);
        uncached = uncached.concat(more);
    }
    return uncached;
};
Sideburn.prototype.calculateTop = function($li) {
/*
    Calculate the item's "home" position.
    Typically 0, but it might change and some plugins might just do weird
    things.
*/
    if (this.plugin.calculateTop) {
        return this.plugin.calculateTop($li);
    } else {
        return 0;
    }
};
Sideburn.prototype.calculateLeft = function($li) {
/*
    Calculate the item's "home" position.
    Typically 0, but it might change and some plugins might just do weird
    things.
*/
    if (this.plugin.calculateLeft) {
        return this.plugin.calculateLeft($li);
    } else {
        return 0;
    }
};
Sideburn.prototype.calculateWidth = function($li) {
/*
    Calculate the ul element's width.
    This is usually the same as the current item, but for some plugins it might
    be as wide as the available area with multiple items visible at once.
    Or something else entirely. Who knows?
*/
    var width;
    if (this.plugin.calculateWidth) {
        width = this.plugin.calculateWidth($li);
    } else {
        width = $li.width();
    }
    return width;
};
Sideburn.prototype.calculateHeight = function($li) {
/*
    Calculate the ul element's height.
    This is usually the same as the current item, but for some plugins it might
    be as high as the highest item, because multiple items are visible at the
    same time.
    Or something else entirely. Who knows?
*/
    var height;
    if (this.plugin.calculateHeight) {
        height = this.plugin.calculateHeight($li);
    } else {
        height = $li.height();
    }
    return height;
};
Sideburn.prototype._showLoader = function() {
/*
    Automatically called when preloading.
    For internal use only.
*/
    this.wrap.addClass('sideburn-loading');
    var w = this.wrap.width();
    this.preload.width(w);
};
Sideburn.prototype._hideLoader = function() {
/*
    Automatically called when animating.
    For internal use only.
*/
    this.wrap.removeClass('sideburn-loading');
};
Sideburn.prototype._animate = function(oldIndex, newIndex, callback) {
/*
    Automatically called after preloading or immediately when showing
    if no preloading necessary.
    Does some boilerplate stuff and wraps the plugin's animate method.
    For internal use only.
*/
    this._hideLoader();

    // sanity
    if (oldIndex == newIndex) {
        callback();
        return;
    }

    // then resize the ul to be the same size as the new item plus nav
    // while animating the old and new items according to the plugin
    var $oldItem = this.items.eq(oldIndex);
    var $newItem = this.items.eq(newIndex);

    // smoothly animate the ul's dimensions to fit the new item
    //this._adjustDimensions(newIndex, this.speed);
    this.recalculateSize();

    // then call the callback
    this.plugin.animate($oldItem, $newItem, callback);
};
Sideburn.prototype._adjustDimensions = function(index, speed) {
    if (this.resizing) {
        return;
    }

    this.resizing = true;

    var sideburn = this,
        $item = this.items.eq(index),
        width = this.calculateWidth($item),
        height = this.calculateHeight($item);

    this.ul.animate({
        'width': width,
        'height': height
    }, speed, function() {
        sideburn.resizing = false;
    });
};
Sideburn.prototype._initialAnimate = function(index, callback) {
/*
    Automatically called when showing for the first time after preloading
    or immediately if no preloading is necessary.
    The initial show is different because you can't animate from one item
    to another as nothing is visible yet.
    For internal use only
*/
    this._hideLoader();
    var $first = this.items.eq(index);
    if (this.nav) {
        this.nav.element.show();
    }

    var speed = this.speed;
    if (this.skipFirstRun) {
        speed = 0;
    }

    $first
        .css('top', this.calculateTop($first))
        .css('left', this.calculateLeft($first))
        .hide();

    // adjust the dimensions
    this.recalculateSize(true);

    $first.fadeIn(speed, callback);
};
Sideburn.prototype._preload = function(urls, callback) {
/*
    Automatically called when showing some image(s) that aren't loaded yet.
    For internal use only.
*/
    this._showLoader();
    var sideburn = this;
    // check periodically to see if they are loaded
    // once loaded, call the callback
    function check() {
        var waiting = [];
        for (var i in urls) {
            var url = urls[i];
            var obj = sideburn.preloadCache[url];
            if (obj && !obj.complete) {
                waiting.push(url);
            }
        }
        if (waiting.length) {
            urls = waiting;
            //setTimeout(check, 1000);
            setTimeout(check, 100);
        } else {
            callback();
        }
    }
    check();
};
Sideburn.prototype.updateNav = function() {
    if (!this.nav) {
        return;
    }
    if (this.nav.style == 'next') {
        if (this.nav.showTotal) {
            this.nav.currentElement.html(this.currentIndex+1);
        }
    }
    if (this.nav.style == 'jump') {
        this.nav.element.find('.selected').removeClass('selected');
        this.nav.element.find('.jump').eq(this.currentIndex)
            .addClass('selected');
    }
    if (this.nav.style == 'thumbnails') {
        this.nav.element.find('.selected').removeClass('selected');
        this.nav.element.find('.thumbnails li').eq(this.currentIndex)
            .addClass('selected');
    }

    if (this.plugin.updateNav) {
        this.plugin.updateNav();
    }
};
Sideburn.prototype.show = function(index) {
/*
    Switch to an item specified by index.
*/
    var sideburn = this;

    if (this.justPaused) {
        this.justPaused = false;
        return;
    }

    if (this.busyShowing) {
        // queue the click?
    } else {
        this.busyShowing = true; // TODO: set class, disabled cursor?
        function afterAnimate() {
            sideburn.busyShowing = false;
            var $current = sideburn.items.eq(index);
            /*
            if (sideburn.resized) {
                sideburn.resized = false;
                var height = sideburn.calculateHeight($current),
                    left = sideburn.calculateLeft($current),
                    top = sideburn.calculateTop($current);
                sideburn.ul.css('height', height);
                sideburn.ul.css('left', left);
                sideburn.ul.css('top', top);
            }
            */
            sideburn.items.removeClass('start');
            $current.addClass('start');
            if (sideburn.timeout && !sideburn.pause) {
                setTimeout(function() {
                    sideburn.next();
                }, sideburn.timeout);
            }
        }
        function reallyShow() {
            var previousIndex = sideburn.currentIndex;
            sideburn.currentIndex = index;
            sideburn.updateNav();
            if (sideburn.firstRun) {
                sideburn.firstRun = false;
                sideburn._initialAnimate(index, afterAnimate);
            } else if (sideburn.showAll) {
                // going from showAll to showOne
                sideburn.one();
            } else {
                sideburn._animate(previousIndex, index, afterAnimate);
            }
        }
        var uncached = this.getUncachedUrls(this.getUrls(index));
        if (uncached.length) {
            var urlsToLoad = uncached;
            if (this.preloadAll) {
                urlsToLoad = this.getAllUncachedUrls();
            }
            this._preload(urlsToLoad, function() {
                reallyShow();
            });
        } else {
            reallyShow();
        }
    }
};
Sideburn.prototype.next = function() {
/*
    Switch to the next item.
*/
    var nextIndex = this.currentIndex+1;
    if (nextIndex == this.numItems) {
        nextIndex = 0;
    }
    this.show(nextIndex);
};
Sideburn.prototype.previous = function() {
/*
    Switch to the previous item.
*/
    var nextIndex = this.currentIndex-1;
    if (nextIndex < 0) {
        nextIndex = this.numItems-1;
    }
    this.show(nextIndex);
};
Sideburn.prototype.all = function() {
/*
    Switch to show all.
*/
    var sideburn = this,
        maxWidth = 0,
        t = 0;

    this.busyShowing = true;
    this.showAll = true;
    this.wrap.addClass('sideburn-nav-all');

    // spread them out
    this.items.show();
    this.items.each(function(index) {
        var $li = $(this),
            width = sideburn.calculateWidth($li);

        // just in case the items aren't all the same width
        if (width > maxWidth) {
            maxWidth = width;
        }

        // first on top
        if (index == sideburn.currentIndex) {
            $li.css('z-index', 1);
        } else {
            $li.css('z-index', 0);
        }
        $li.css({
            'left': 0
        });
        $li.animate({
            'top': t,
            'left': 0 // just in case
        }, sideburn.speed);

        t += sideburn.calculateHeight($li);
    });

    // size the ul to fit them all
    this.ul.animate({
        width: maxWidth,
        height: t
    }, this.speed, function() {
        sideburn.busyShowing = false;
        sideburn.items.css('z-index', 1); // clean up again
    });
};
Sideburn.prototype.one = function() {
/*
    Switch to show one.
*/
    var sideburn = this,
        $current = this.items.eq(this.currentIndex),
        $others = this.items.not($current),
        width = this.calculateWidth($current),
        height = this.calculateHeight($current);

    this.busyShowing = true;
    this.showAll = false;
    this.wrap.removeClass('sideburn-nav-all');

    // put the current one on top of the others
    $current.css('z-index', 1);
    $others.css('z-index', 0);

    // move them all up again
    this.items.each(function() {
        var $li = $(this);
        $li.animate({
            'top': 0, // calculateLeft rather?
            'left': 0 // calculateTop rahter?
        }, sideburn.speed);
    });

    // size the ul to fit just the current one
    this.ul.animate({
        width: width,
        height: height
    }, this.speed, function() {
        sideburn.busyShowing = false;
        sideburn.items.css('z-index', 1); // clean up again
        $others.hide();
    });
};

$.fn.sideburn = function(method) {
    this.each(function() {
        if (this.tagName.toLowerCase() != 'ul') {
            return;
        }
        var $ul = $(this);
        if (!$ul.find('> li').length) {
            return;
        }

        if (method == "destroy") {
            // NOTE: this doesn't currently reset class="current".
            // That's a feature, not a bug ;)
            var $wrap = $ul.parents('.sideburn-wrap'),
                sideburn = $ul.data('sideburn')
            if (sideburn && $wrap.length) {
                sideburn.pause = true;
                sideburn.justPaused = true;
                if (sideburn.resizefunc) {
                    $(window).unbind('resize', sideburn.resizefunc);
                }
                $ul.removeData('sideburn');
                $wrap.find('ul,li').removeAttr('style');
                $ul.find('> li > img:only-child').unbind('click');
                $wrap.replaceWith($ul);
            }
        } else if (method == "refresh") {
            sideburn = $ul.data('sideburn')
            sideburn.recalculateSize();
        } else {
            var sideburn = new Sideburn($ul);
            $ul.data('sideburn', sideburn);
        }
    });
    return this;
};
})(jQuery);
