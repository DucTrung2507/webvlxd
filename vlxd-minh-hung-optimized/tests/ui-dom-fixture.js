/* Minimal shared fixture for JSC UI tests; no browser/network. */
var window = {}, checks = 0;
function assert(ok, message) { if (!ok) throw new Error(message); checks++; }
function equal(a, b, message) { assert(a === b, message + ': ' + String(a) + ' !== ' + String(b)); }
function Element(tag, attrs) {
    this.tagName = tag.toUpperCase(); this.attributes = {}; this.children = []; this.parentElement = null;
    this.listeners = {}; this.className = ''; this.value = ''; this.defaultValue = ''; this.textContent = '';
    this.hidden = false; this.disabled = false; this.open = false;
    var self = this;
    this.classList = {remove:function (name) { self.className = self.className.split(/\s+/).filter(function (x) { return x !== name; }).join(' '); }, toggle:function (name, enabled) { this.remove(name); if (enabled) self.className = (self.className + ' ' + name).trim(); }};
    Object.keys(attrs || {}).forEach(function (k) { self.setAttribute(k, attrs[k]); });
}
Element.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'value') this.value = this.defaultValue = String(v); };
Element.prototype.getAttribute = function (k) { return this.attributes[k] ?? null; };
Element.prototype.removeAttribute = function (k) { delete this.attributes[k]; };
Element.prototype.getAttribute = function (k) { return this.attributes[k] === undefined ? null : this.attributes[k]; };
Element.prototype.matches = function (s) { return s[0] === '.' ? this.className.split(/\s+/).includes(s.slice(1)) : s[0] === '[' ? Object.prototype.hasOwnProperty.call(this.attributes, s.slice(1, -1)) : this.tagName === s.toUpperCase(); };
Element.prototype.querySelectorAll = function (selectors) {
    var found = [], wanted = selectors.split(',').map(function (s) { return s.trim(); });
    function walk(node) { node.children.forEach(function (child) { if (wanted.some(function (s) { return child.matches(s); })) found.push(child); walk(child); }); }
    walk(this); return found;
};
Element.prototype.querySelector = function (s) { return this.querySelectorAll(s)[0] || null; };
Element.prototype.closest = function (s) { var n = this; while (n) { if (n.matches(s)) return n; n = n.parentElement; } return null; };
Element.prototype.appendChild = function (child) { this.children.push(child); child.parentElement = this; return child; };
Element.prototype.replaceChildren = function () { this.children.forEach(function (n) { n.parentElement = null; }); this.children = []; Array.from(arguments).forEach(this.appendChild.bind(this)); };
Element.prototype.remove = function () { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; };
Element.prototype.addEventListener = function (type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); };
Element.prototype.focus = function () { document.activeElement = this; };
Element.prototype.reset = function () { this.querySelectorAll('input').forEach(function (n) { n.value = n.defaultValue; }); };
Element.prototype.showModal = function () { this.open = true; };
Element.prototype.close = function () { this.open = false; };
Element.prototype.getBoundingClientRect = function () { return {left:0,right:900,top:0,bottom:900}; };
['nextElementSibling', 'previousElementSibling'].forEach(function (k) { Object.defineProperty(Element.prototype, k, {get:function () { if (!this.parentElement) return null; var list = this.parentElement.children; return list[list.indexOf(this) + (k === 'nextElementSibling' ? 1 : -1)] || null; }}); });
// Parse actual flat addItem template instead of reconstructing row contents in the test.
Object.defineProperty(Element.prototype, 'innerHTML', {get:function () { return this._html || ''; }, set:function (source) {
    this._html = source;
    this.replaceChildren(); var tags = /<([a-z][\w-]*)([^>]*)>/gi, tag;
    while ((tag = tags.exec(source))) {
        var attrs = {}, attribute, pattern = /([\w-]+)(?:="([^"]*)")?/g;
        while ((attribute = pattern.exec(tag[2]))) attrs[attribute[1]] = attribute[2] || '';
        this.appendChild(new Element(tag[1], attrs));
    }
}});
var nodes = {}, body = new Element('body');
var document = {activeElement:body, listeners:{}, getElementById:function (id) { if (!nodes[id]) throw new Error('Missing fixture ' + id); return nodes[id]; }, createElement:function (tag) { return new Element(tag); }, querySelectorAll:body.querySelectorAll.bind(body), addEventListener:Element.prototype.addEventListener};
function add(id, tag, parent, attrs) { var el = new Element(tag, attrs); nodes[id] = el; (parent || body).appendChild(el); return el; }
