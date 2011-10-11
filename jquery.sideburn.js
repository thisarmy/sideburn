(function($) {
/*

EXAMPLE
=======

<ul class="sideburn"
    data-speed="1000"
    data-style="reveal-left"
    data-nav="{style='next', total=true, brackets=true, position='above'}"
>
<li><img src="image1.png"></li>
<li><img src="image2.png"></li>
<li><img src="image3.png"></li>
<li><img src="image4.png"></li>
</ul>

becomes:

<div class="sideburn-wrap">
<div class="sideburn-nav sideburn-nav-next sideburn-nav-above">
    <span class="previous">Previous</span> <span class="separator">/</span> <span class="next">Next</span>
    <span class="position">(<span class="current">1</span> of <span class="total">4</span>)</span>
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
    speed (0 instant, default)
    timeout (0 no-auto, default)
    style (see styles and plugins below)

    nav (json)
        style = next/jump/thumbnails
        next (default to Next)
        previous (default to Previous)
        textseparator (default to /)
        total = true/false
        brackets = true/false
        position = above/below
        jumpseparator (default to |)
        numbering (1 or 01)

    shuffle (default false)
    start (default index or random)
    skipfirstrun (default false)

* Events (callbacks?):
    - sideburn:initialized
    - sideburn:resized
    - sideburn:switch($previous, $next)
    - sideburn:loading(numberOfImages)
    - sideburn:loadedOne()
    - sideburn:loadingComplete()
    - sideburn:show($item)
    - sideburn:beforeAnimate($previous, $next)
    - sideburn:afterAnimate($previous, $next)

* Sizes should be recalculated on threshold event. (fallback to window.resize)


STYLES
======

fade
----

new one below current, current more and more transparent.


horizontal
----------

slide left (new ones appear from the right, next to current)
slide right (new ones appear from the left, next to current)
TODO: reveal left (new ones appear from the right, below current)
TODO: reveal right (new ones appear from the left, below current)
TODO: slide left and right (images in a horizontal line)
TODO: slide left and right wrap (images in a horizontal line, wrap around)

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
}
Fade.prototype.animate = function($oldItem, $newItem, callback) {
    console.log("Fade.animate", $oldItem, $newItem);
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
}
plugins['fade'] = Fade;

var SlideLeft = function(sideburn) {
    this.sideburn = sideburn;
}
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
}
plugins['slide-left'] = SlideLeft;

var SlideRight = function(sideburn) {
    this.sideburn = sideburn;
}
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
}
plugins['slide-right'] = SlideRight;


/*
plugins['reveal-left']
plugins['reveal-right']
plugins['slide-left-right']
plugins['slide-left-right-wrap'] (default)
plugins['slide-up']
plugins['slide-down']
plugins['reveal-up']
plugins['reveal-down']
plugins['slide-up-down']
plugins['slide-up-down-wrap']
*/

function detectPlugin(style) {
    var plugin = plugins['fade']; // TODO: change default
    if (plugins[style]) {
        plugin = plugins[style];
    }
    return plugin;
}

var Sideburn = function($ul) {
    var sideburn = this;

    this.currentIndex = 0;
    this.firstRun = true;
    this.skipFirstRun = false;
    this.busyShowing = false;
    this.resized = false;
    this.pause = false;
    this.justPaused = false;

    // the ul must have overflow: none and position: relative
    this.ul = $ul;
    this.ul
        .css('overflow', 'none')
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
            //console.log("installing loader for", img);
            $img.load(function() {
                //console.log(img, "loaded");
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
    this.speed = 0;
    if (this.ul.data('speed')) {
        var speed = parseInt(this.ul.data('speed'), 10);
        if (speed > 0) {
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
            style: 'next',
            position: 'above',
            total: (nav.total) ? true : false,
            brackets: (nav.brackets) ? true : false,
            next: nav.next || 'Next',
            previous: nav.previous || 'Previous',
            textseparator: nav.textseparator || '/',
            numbering: '1',
            jumpseparator: nav.jumpseparator || '|'
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
    this.skipFirstRun = (this.ul.data('skipfirstrun')) ? true : false;

    // add the navigation div if there should be nav (start out hidden)
    this.wrap.find('> .sideburn-nav').remove();
    if (this.nav) {
        var html = '';
        html += '<div class="sideburn-nav sideburn-nav-'+this.nav.style+
        ' sideburn-nav-'+this.nav.position+'">';
        if (this.nav.style == 'next') {
            html += '<span class="previous">'+this.nav.previous+'</span> ';
            html += '<span class="separator">'+this.nav.textseparator+'</span> ';
            html += '<span class="next">'+this.nav.next+'</span> ';
            if (this.nav.total) {
                html += '<span class="position">';
                if (this.nav.brackets) {
                    html += '(';
                }
                html += '<span class="current">'+(this.currentIndex+1)+'</span> ';
                html += 'of <span class="total">'+this.numItems+'</span>';
                if (this.nav.brackets) {
                    html += ')';
                }
                html += '</span>';
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
                parts.push('<span class="jump'+selected+'" data-index="'+i+'">');
                parts.push(label);
                parts.push('</span>');
                bits.push(parts.join(''));
            }
            html += bits.join(' <span class="separator">'+
                this.nav.jumpseparator+'</span> ');
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
        if (this.nav.total) {
            this.nav.currentElement = this.nav.element.find('.current');
        }
        this.nav.element.find('.previous').click(function() {
            sideburn.previous();
        });
        this.nav.element.find('.next').click(function() {
            sideburn.next();
        });
        this.nav.element.find('.jump').click(function() {
            sideburn.show($(this).data('index'));
        });
        this.nav.element.find('.thumbnails li').click(function() {
            sideburn.show($(this).data('index'));
        });
    }

    var Plugin = detectPlugin(this.ul.data('style'));
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

    // assign initial height if nothing was assigned in css
    if (this.ul.height() < 20) {
        this.ul.css('height', '400px'); // TODO: come up with responsive default
    }
    if (this.plugin.init) {
        this.plugin.init();
    }

    this.show(this.currentIndex);
}
Sideburn.prototype.getId = function(index) {
    return this.items.eq(index).attr('id');
}
Sideburn.prototype.getUrls = function(index) {
    // pull the urls for the item at index out of the cache
    return this.urlCache[this.getId(index)] || [];
}
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
}
Sideburn.prototype.getAllUncachedUrls = function() {
    var uncached = [];
    for (var i=0; i<numItems; i++) {
        var urls = this.getUrls(i);
        var more = this.getUncachedUrls(urls);
        uncached = uncached.concat(more);
    }
    return uncached;
}
Sideburn.prototype.calculateTop = function($li) {
/*
    Calculate the item's "home" position.
    Typically 0, but it might change and some plugins might just do weird things.
*/
    if (this.plugin.calculateTop) {
        return this.plugin.calculateTop($li);
    } else {
        return 0;
    }
}
Sideburn.prototype.calculateLeft = function($li) {
/*
    Calculate the item's "home" position.
    Typically 0, but it might change and some plugins might just do weird things.
*/
    if (this.plugin.calculateLeft) {
        return this.plugin.calculateLeft($li);
    } else {
        return 0;
    }
}
Sideburn.prototype.calculateWidth = function($li) {
/*
    Calculate the ul element's width.
    This is usually the same as the current item, but for some plugins it might
    be as wide as the available area with multiple items visible at once.
    Or something else entirely. Who knows?
*/
    if (this.plugin.calculateWidth) {
        return this.plugin.calculateWidth($li);
    } else {
        return $li.width();
    }
}
Sideburn.prototype.calculateHeight = function($li) {
/*
    Calculate the ul element's height.
    This is usually the same as the current item, but for some plugins it might be
    as high as the highest item, because multiple items are visible at the same
    time.
    Or something else entirely. Who knows?
*/
    if (this.plugin.calculateHeight) {
        return this.plugin.calculateHeight($li);
    } else {
        return $li.height();
    }
}
Sideburn.prototype._showLoader = function() {
/*
    Automatically called when preloading.
    For internal use only.
*/
    this.wrap.addClass('sideburn-loading');
    var w = this.wrap.width();
    var h = this.wrap.height();
    this.preload
        .width(w)
        .height(h)
        .css('line-height', h+'px');
}
Sideburn.prototype._hideLoader = function() {
/*
    Automatically called when animating.
    For internal use only.
*/
    this.wrap.removeClass('sideburn-loading');
}
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
    // while animating the old and new items according to the style
    var $oldItem = this.items.eq(oldIndex);
    var $newItem = this.items.eq(newIndex);

    var width = this.calculateWidth($newItem);
    var height = this.calculateHeight($newItem);
    this.ul.animate({
        'width': width,
        'height': height
    }, this.speed);

    // then call the callback
    this.plugin.animate($oldItem, $newItem, callback);
}
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

    var width = this.calculateWidth($first);
    var height = this.calculateHeight($first);
    this.ul.animate({
        'width': width,
        'height': height
    }, speed);

    $first.fadeIn(speed, callback);
}
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
            //console.log("still waiting for", waiting.length);
            urls = waiting;
            setTimeout(check, 1000);
        } else {
            callback();
        }
    }
    check();
}
Sideburn.prototype.updateNav = function() {
    if (!this.nav) {
        return;
    }
    if (this.nav.style == 'next') {
        if (this.nav.total) {
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
}
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
        this.busyShowing = true;
        function afterAnimate() {
            sideburn.busyShowing = false;
            if (sideburn.resized) {
                sideburn.resized = false;
                var $current = sideburn.items.eq(index);
                var height = sideburn.calculateHeight($current);
                var left = sideburn.calculateLeft($current);
                var top = sideburn.calculateTop($current);
                sideburn.ul.css('height', height);
                sideburn.ul.css('left', left);
                sideburn.ul.css('top', top);
            }
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
}
Sideburn.prototype.next = function() {
/*
    Switch to the next item.
*/
    var nextIndex = this.currentIndex+1;
    if (nextIndex == this.numItems) {
        nextIndex = 0;
    }
    this.show(nextIndex);
}
Sideburn.prototype.previous = function() {
/*
    Switch to the previous item.
*/
    var nextIndex = this.currentIndex-1;
    if (nextIndex < 0) {
        nextIndex = this.numItems-1;
    }
    this.show(nextIndex);
}

$.fn.sideburn = function(method) {
    this.each(function() {
        if (this.tagName.toLowerCase() != 'ul') {
            return;
        }
        var $ul = $(this);
        if (!$ul.find('> li').length) {
            return;
        }

        var sideburn = new Sideburn($ul);
    });
    return this;
}
})(jQuery);
