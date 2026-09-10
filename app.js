// ===== diagram v3 =====
// Open browser console (F12 → Console) to see debug output.
// If connections don't work, paste this in console: localStorage.clear(); location.reload();
(function() {
    'use strict';

    // ===== Version =====
    var VERSION = '1.1.2';  // v1.1.2: priority attachment ports, connection-over-shape click, syntax fix

    // ===== Configuration =====
    var CONFIG = {
        connHitPx: 10,          // px threshold for clicking near a connection line
        handleSize: 10,         // half-size of resize handles (22px total, touch-friendly)
        handleGrabPx: 14,       // px tolerance around resize handles
        minShapeSize: 20,       // minimum width/height for any shape
        dupOffset: 30,          // pixel offset when duplicating
        pasteOffset: 50,         // pixel offset when pasting
        arrowSize: 10,          // arrowhead length
        arrowSpread: 0.35,      // arrowhead spread angle (radians)
        snapPx: 16,             // px threshold for snapping line endpoints to shapes (at 100% zoom)
        maxUndo: 50,            // max undo history entries
        zoomStep: 0.1,          // zoom increment per wheel/button click
        minZoom: 0.1,           // minimum zoom level
        maxZoom: 5,             // maximum zoom level
        defaultFontSize: 14,    // default font size for new shapes
        maxCanvasW: 10000,      // max canvas width user can set
        maxCanvasH: 10000       // max canvas height user can set
    };

    // ===== State =====
    var S = {
        shapes: [],
        connections: [],
        selection: [],           // unified: shape ids ('s...') and conn ids ('c...')
        tool: 'select',
        zoom: 1, panX: 0, panY: 0,
        isPanning: false, isDrawing: false, isResizing: false, isDragging: false, isSelecting: false,
        isDraggingConn: false, dragConnId: null, dragConnEnd: null, dragConnAnchors: null,
        dragStart: { x: 0, y: 0 }, dragOrigin: [],
        resizeHandle: null, resizeStart: null,
        drawStart: null, panStart: null, selectStart: null, drawStartShapeId: null,
        nextId: 1, undoStack: [], redoStack: [],
        pointers: {}, pinchStart: null,  // active pointers for pinch-to-zoom
        nameCounters: {},            // per-type counter for shapes (string keys)
        connNameCounter: 0,          // counter for connection names
        actionLog: [],               // [{msg, cat, ts}]
        clipboard: null,               // copied shapes/connections for copy/paste
        gridSize: 20, showGrid: true, snapToGrid: true,
        canvasW: 3000, canvasH: 2000, // bounded canvas dimensions
        projectName: 'Untitled',     // project name shown in panel
        readOnly: false,             // true when another tab is the editor
        autoSaveFileHandle: null,    // FileSystemFileHandle for native auto-save
        channel: null,               // BroadcastChannel for multi-tab coordination
        tabId: '',                   // unique tab identifier
        metadata: {                  // document metadata
            version: VERSION,
            createdAt: null,
            updatedAt: null,
            savedAt: null
        }
    };

    // ===== DOM refs (cached once, never looked up again) =====
    var canvas         = document.getElementById('canvas');
    var shapesLayer    = document.getElementById('shapes-layer');
    var previewLayer   = document.getElementById('preview-layer');
    var gridLayer      = document.getElementById('grid-layer');
    var container      = document.getElementById('canvas-container');
    var propsPanel     = document.getElementById('properties-panel');
    var btnCollapse    = document.getElementById('btn-collapse-panel');
    var panelHeader    = document.getElementById('panel-header');
    var panelTitle     = document.getElementById('panel-title');
    var contextMenu    = document.getElementById('context-menu');
    var textEditor     = document.getElementById('text-editor');
    var textInput      = document.getElementById('text-input');
    var zoomDisplay    = document.getElementById('zoom-display');
    var logBody        = document.getElementById('log-body');
    var logHeader      = document.getElementById('log-header');

    // Theme colors (read from CSS vars, updated on toggle)
    var T = { accent: '#2563EB', grid: '#2C2C32' };
    function readTheme() {
        try {
            var style = getComputedStyle(document.documentElement);
            var a = style.getPropertyValue('--color-accent').trim();
            var g = style.getPropertyValue('--color-grid-line').trim();
            if (a) T.accent = a;
            if (g) T.grid = g;
        } catch(e) { /* keep hardcoded fallbacks */ }
    }

    // === Action log ===
    var MAX_LOG = 500;
    function logAction(msg, cat) {
        var now = new Date();
        var ts = now.getHours().toString().padStart(2, '0') + ':' +
                 now.getMinutes().toString().padStart(2, '0') + ':' +
                 now.getSeconds().toString().padStart(2, '0');
        var entry = { msg: msg, cat: cat || 'sys', ts: ts };
        S.actionLog.push(entry);
        if (S.actionLog.length > MAX_LOG) S.actionLog.shift();
        if (!logBody) return;
        var el = document.createElement('div');
        el.className = 'log-entry';
        el.innerHTML = '<span class="log-time">'+ts+'</span><span class="log-'+cat+'">'+escHtml(msg)+'</span>';
        logBody.appendChild(el);
        logBody.scrollTop = logBody.scrollHeight;
    }
    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Toolbar
    var fillInput      = document.getElementById('fillColor');
    var strokeInput    = document.getElementById('strokeColor');
    var swInput        = document.getElementById('strokeWidth');
    var opacityInput   = document.getElementById('opacity');
    var textColorInput = document.getElementById('textColor');

    // Props panel — shape
    var propFill       = document.getElementById('prop-fill');
    var propStroke     = document.getElementById('prop-stroke');
    var propSw         = document.getElementById('prop-sw');
    var propOpacity    = document.getElementById('prop-opacity');
    var propFillOpacity  = document.getElementById('prop-fillOpacity');
    var propStrokeOpacity = document.getElementById('prop-strokeOpacity');
    var propTextColor  = document.getElementById('prop-textColor');
    var propX          = document.getElementById('prop-x');
    var propY          = document.getElementById('prop-y');
    var propWidth      = document.getElementById('prop-width');
    var propHeight     = document.getElementById('prop-height');
    var propText       = document.getElementById('prop-text');
    var propFontSize   = document.getElementById('prop-fontSize');
    var propTextPad    = document.getElementById('prop-textPad');
    var propNameInput  = document.getElementById('prop-name');
    var propZHeight    = document.getElementById('prop-zHeight');
    var propTextAlign  = document.getElementById('prop-textAlign');
    var canvasWidth    = document.getElementById('canvas-width');
    var canvasHeight   = document.getElementById('canvas-height');
    var projectNameInput = document.getElementById('project-name');
    var btnSaveFile    = document.getElementById('btn-save-file');
    var btnLoadFile    = document.getElementById('btn-load-file');
    var btnExport      = document.getElementById('btn-export');
    var btnNew         = document.getElementById('btn-new');
    var exportDrop     = document.getElementById('export-drop');

    // Props panel — connection
    var connColor       = document.getElementById('conn-color');
    var connNameInput   = document.getElementById('conn-name');
    var connWidth       = document.getElementById('conn-width');
    var connArrowStart  = document.getElementById('conn-arrow-start');
    var connArrowEnd    = document.getElementById('conn-arrow-end');
    var customSvgCode   = document.getElementById('custom-svg-code');
    var customVbW       = document.getElementById('custom-viewbox-w');
    var customVbH       = document.getElementById('custom-viewbox-h');

    // ===== Selection helpers =====
    function isShapeId(id) { return id.charAt(0) === 's'; }
    function isConnId(id)  { return id.charAt(0) === 'c'; }

    function shapeSel() { return S.selection.filter(isShapeId); }
    function connSel()  { return S.selection.filter(isConnId); }

    function select(id, multi) {
        var kindIsShape = isShapeId(id);
        if (!multi) {
            S.selection = [id];
        } else if (!S.selection.includes(id)) {
            // keep same-kind selections, clear opposite kind on cross-kind multi-select
            S.selection = S.selection.filter(kindIsShape ? isShapeId : isConnId);
            S.selection.push(id);
        }
        render();
    }

    function deselectAll() { S.selection = []; render(); }

    // ===== Geometry helpers =====
    function genId() { return 's' + (S.nextId++); }
    function cid()  { return 'c' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }

    function toCanvas(sx, sy) {
        var r = container.getBoundingClientRect();
        return { x: (sx - r.left - S.panX) / S.zoom, y: (sy - r.top - S.panY) / S.zoom };
    }
    function snap(v) { return S.snapToGrid ? Math.round(v / S.gridSize) * S.gridSize : v; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function clampShape(s) {
        if (s.x < 0) s.x = 0;
        if (s.y < 0) s.y = 0;
        if (s.x + s.width > S.canvasW) s.x = S.canvasW - s.width;
        if (s.y + s.height > S.canvasH) s.y = S.canvasH - s.height;
        if (s.width > S.canvasW) { s.width = S.canvasW; s.x = 0; }
        if (s.height > S.canvasH) { s.height = S.canvasH; s.y = 0; }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        var len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
        var t = clamp(((px - x1) * dx + (py - y1) * dy) / len2, 0, 1);
        var nx = x1 + t * dx, ny = y1 + t * dy;
        return Math.sqrt((px - nx) * (px - nx) + (py - ny) * (py - ny));
    }

    /** Returns the closest connection within hit threshold of canvas-point pos, or null. */
    function findConnAt(pos) {
        var threshold = CONFIG.connHitPx / S.zoom;
        var closest = null, closestDist = threshold;
        S.connections.forEach(function(c) {
            var ep = connEndpoints(c);
            if (!ep) return;
            var d = distToSegment(pos.x, pos.y, ep.x1, ep.y1, ep.x2, ep.y2);
            if (d < closestDist) { closestDist = d; closest = c; }
        });
        return closest;
    }

    /** Returns the point on shape s's perimeter closest to target (tx,ty). */
    function getShapeOutlinePoint(s, tx, ty) {
        var cx = s.x + s.width / 2, cy = s.y + s.height / 2;
        var dx = tx - cx, dy = ty - cy;
        if (dx === 0 && dy === 0) return { x: cx, y: cy + s.height / 2 };
        var hw = s.width / 2, hh = s.height / 2;
        switch (s.type) {
            case 'circle':
                var rx = hw, ry = hh;
                var nx = dx / rx, ny = dy / ry;
                var nd = Math.sqrt(nx * nx + ny * ny);
                return { x: cx + (nx / nd) * rx, y: cy + (ny / nd) * ry };
            case 'diamond':
                var t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
                return { x: cx + dx * t, y: cy + dy * t };
            case 'triangle':
                var top = { x: cx, y: cy - hh };
                var bl  = { x: cx - hw, y: cy + hh };
                var br  = { x: cx + hw, y: cy + hh };
                var best = { x: cx, y: cy + hh, d: Infinity };
                [[top, bl], [bl, br], [br, top]].forEach(function(e) {
                    var ex = e[1].x - e[0].x, ey = e[1].y - e[0].y;
                    var denom = dx * ey - dy * ex;
                    if (Math.abs(denom) < 1e-10) return;
                    var u = ((cx - e[0].x) * dy - (cy - e[0].y) * dx) / denom;
                    var v = ((cx - e[0].x) * ey - (cy - e[0].y) * ex) / denom;
                    if (v > 0 && u >= 0 && u <= 1) {
                        var hit = { x: cx + dx * v, y: cy + dy * v };
                        var dist = Math.sqrt((hit.x-cx)*(hit.x-cx) + (hit.y-cy)*(hit.y-cy));
                        if (dist < best.d) { best = hit; best.d = dist; }
                    }
                });
                return { x: best.x, y: best.y };
            default: // rect, roundRect, terminator
                // Clamp to bounding box to get the nearest perimeter point.
                // Handles both interior and exterior points correctly.
                var nx = clamp(tx, s.x, s.x + s.width);
                var ny = clamp(ty, s.y, s.y + s.height);
                // If the point is inside, clamp doesn't move it — project to nearest edge
                if (nx === tx && ny === ty) {
                    var dL = tx - s.x, dR = s.x + s.width - tx;
                    var dT = ty - s.y, dB = s.y + s.height - ty;
                    var mn = Math.min(dL, dR, dT, dB);
                    if (mn === dL) return { x: s.x, y: ty };
                    if (mn === dR) return { x: s.x + s.width, y: ty };
                    if (mn === dT) return { x: tx, y: s.y };
                    return { x: tx, y: s.y + s.height };
                }
                return { x: nx, y: ny };
        }
    }

    /** Returns the 8 priority connection ports (corners + edge midpoints) for a shape,
     *  as an array of {x, y, name} in canvas coordinates. */
    function shapePorts(s) {
        var x1 = s.x, y1 = s.y, x2 = s.x + s.width, y2 = s.y + s.height;
        var cx = s.x + s.width / 2, cy = s.y + s.height / 2;
        return [
            { x: x1, y: y1,   name: 'top-left' },
            { x: cx, y: y1,   name: 'top-center' },
            { x: x2, y: y1,   name: 'top-right' },
            { x: x1, y: cy,   name: 'middle-left' },
            { x: x2, y: cy,   name: 'middle-right' },
            { x: x1, y: y2,   name: 'bottom-left' },
            { x: cx, y: y2,   name: 'bottom-center' },
            { x: x2, y: y2,   name: 'bottom-right' }
        ];
    }

    /** Finds the nearest port on a shape within threshold px (canvas coords). Returns
     *  { port, dist } or null if none within range. */
    function nearestPort(pos, shape, threshold) {
        var best = null, bestDist = threshold;
        shapePorts(shape).forEach(function(p) {
            var d = Math.sqrt((pos.x - p.x)*(pos.x - p.x) + (pos.y - p.y)*(pos.y - p.y));
            if (d < bestDist) { bestDist = d; best = p; }
        });
        return best ? { port: best, dist: bestDist } : null;
    }

    /** Returns the nearest non-anchor shape whose outline is within px of pos, or null.
     *  Points inside the shape always match (distance = 0). */
    function findNearestShape(pos, px) {
        var best = null, bestDist = px;
        // Sort shapes by z-height descending (topmost first) to respect layering
        var sorted = S.shapes.slice().sort(function(a, b) {
            return ((b.zHeight || 0) - (a.zHeight || 0)) || S.shapes.indexOf(b) - S.shapes.indexOf(a);
        });
        sorted.forEach(function(s) {
            if (s.isAnchor || s.hidden) return;
            var inside = pos.x >= s.x && pos.x <= s.x + s.width &&
                         pos.y >= s.y && pos.y <= s.y + s.height;
            var left = s.x - px, right = s.x + s.width + px;
            var top  = s.y - px, bottom = s.y + s.height + px;
            if (inside || (pos.x >= left && pos.x <= right && pos.y >= top && pos.y <= bottom)) {
                var d = 0;
                if (!inside) {
                    var outlinePt = getShapeOutlinePoint(s, pos.x, pos.y);
                    d = Math.sqrt((pos.x - outlinePt.x) * (pos.x - outlinePt.x) +
                                  (pos.y - outlinePt.y) * (pos.y - outlinePt.y));
                }
                if (d < bestDist) { bestDist = d; best = s; }
            }
        });
        return best;
    }

    // ===== Shape/connection lookup =====
    function findShape(id) { return S.shapes.find(function(s) { return s.id === id; }); }
    function findConn(id)  { return S.connections.find(function(c) { return c.id === id; }); }

    // Display names for the action log
    function shapeName(id) { var s = findShape(id); return s ? (s.name || (s.type + ' ' + id)) : id; }
    function connName(id)  { var c = findConn(id);  return c ? (c.name || ('Line ' + id)) : id; }

    // ===== Undo/Redo =====
    function updateMetadata() {
        var now = new Date().toISOString();
        if (!S.metadata.createdAt) S.metadata.createdAt = now;
        S.metadata.updatedAt = now;
        S.metadata.savedAt = now;
        S.metadata.version = VERSION;
    }

    function saveState() {
        try {
            updateMetadata();
            localStorage.setItem('diagram-state', JSON.stringify({
                shapes: S.shapes, connections: S.connections, nextId: S.nextId,
                nameCounters: S.nameCounters, connNameCounter: S.connNameCounter,
                zoom: S.zoom, panX: S.panX, panY: S.panY,
                canvasW: S.canvasW, canvasH: S.canvasH,
                projectName: S.projectName,
                metadata: S.metadata
            }));
        } catch(e) {
            console.error('saveState failed:', e);
        }
    }

    var _saveTimer = 0;
    function scheduleSave() {
        if (S.readOnly) return;  // read-only: don't persist
        saveState();
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(saveState, 300);
    }

    // ===== BroadcastChannel: Multi-Tab Coordination =====
    function setupBroadcastChannel() {
        S.tabId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        try {
            S.channel = new BroadcastChannel('diagram-sync');
        } catch(e) {
            // BroadcastChannel not supported (e.g. older browser) – skip
            return;
        }

        var claimTimeout = null;

        S.channel.onmessage = function(ev) {
            var msg = ev.data;
            if (!msg || !msg.type) return;

            switch (msg.type) {
                case 'claim':
                    // Another tab wants to be editor
                    if (msg.tabId === S.tabId) break;
                    if (!S.readOnly) {
                        // We're the editor — deny them
                        S.channel.postMessage({ type: 'deny', ownerTabId: S.tabId, tabId: msg.tabId });
                    } else if (claimTimeout) {
                        // We're also trying to become editor — deterministic tiebreaker
                        // Lower tabId wins (lexicographic comparison)
                        if (msg.tabId < S.tabId) {
                            // They win — cancel our claim, stay read-only
                            clearTimeout(claimTimeout);
                            claimTimeout = null;
                        }
                    }
                    break;

                case 'deny':
                    // Our claim was denied — switch to read-only
                    if (msg.tabId === S.tabId) {
                        clearTimeout(claimTimeout);
                        claimTimeout = null;
                        setReadOnly(true, msg.ownerTabId || 'another tab');
                    }
                    break;

                case 'release':
                    // Editor tab closed — if we're read-only, try to become editor
                    if (S.readOnly && msg.tabId !== S.tabId) {
                        tryBecomeEditor();
                    }
                    break;

                case 'state-changed':
                    // Editor tab signals that state changed — reload from localStorage
                    if (S.readOnly && msg.tabId !== S.tabId) {
                        loadFromLocalStorage();
                    }
                    break;
            }
        };

        // Claim editor role on startup
        function tryBecomeEditor() {
            // Broadcast claim and wait 250ms for denials
            S.channel.postMessage({ type: 'claim', tabId: S.tabId });
            clearTimeout(claimTimeout);
            claimTimeout = setTimeout(function() {
                // No denial received — we're the editor
                setReadOnly(false);
                logAction('This tab is now the editor', 'sys');
            }, 250);
        }

        tryBecomeEditor();
    }

    function setReadOnly(readOnly, ownerHint) {
        var wasReadOnly = S.readOnly;
        S.readOnly = readOnly;

        if (readOnly) {
            document.body.classList.add('read-only-mode');
            var banner = document.getElementById('readonly-banner');
            if (banner) {
                banner.textContent = 'Read-only — ' + (ownerHint || 'another tab') + ' is editing';
                banner.style.display = '';
            }
            if (!wasReadOnly) {
                logAction('Switched to read-only (another tab is editor)', 'sys');
            }
        } else {
            document.body.classList.remove('read-only-mode');
            var banner2 = document.getElementById('readonly-banner');
            if (banner2) banner2.style.display = 'none';
        }
    }

    function loadFromLocalStorage() {
        var saved = localStorage.getItem('diagram-state');
        if (!saved) return;
        try {
            var d = JSON.parse(saved);
            S.shapes = d.shapes || [];
            S.connections = d.connections || [];
            S.nameCounters = d.nameCounters || {};
            S.connNameCounter = d.connNameCounter || 0;
            S.nextId = (d.nextId || 0) + 1;
            if (typeof d.zoom === 'number' && d.zoom >= CONFIG.minZoom && d.zoom <= CONFIG.maxZoom) S.zoom = d.zoom;
            if (typeof d.panX === 'number') S.panX = d.panX;
            if (typeof d.panY === 'number') S.panY = d.panY;
            if (typeof d.canvasW === 'number') S.canvasW = d.canvasW;
            if (typeof d.canvasH === 'number') S.canvasH = d.canvasH;
            if (typeof d.projectName === 'string') S.projectName = d.projectName;
            if (d.metadata) {
                S.metadata = {
                    version: d.metadata.version || VERSION,
                    createdAt: d.metadata.createdAt || null,
                    updatedAt: d.metadata.updatedAt || null,
                    savedAt: d.metadata.savedAt || null
                };
            }
            S.selection = [];
            renderGrid(); render(); applyTransform();
            // Update toolbar inputs
            canvasWidth.value = S.canvasW; canvasHeight.value = S.canvasH;
            if (projectNameInput) projectNameInput.value = S.projectName || '';
            if (zoomDisplay) zoomDisplay.textContent = Math.round(S.zoom * 100) + '%';
        } catch(e) {
            console.error('Failed to load from localStorage:', e);
        }
    }

    // Listen for localStorage changes from other tabs (storage events)
    window.addEventListener('storage', function(e) {
        if (e.key === 'diagram-state' && S.readOnly && e.newValue) {
            loadFromLocalStorage();
        }
    });

    // Notify other tabs that state changed (call after saveState)
    function broadcastStateChange() {
        if (S.channel && !S.readOnly) {
            try {
                S.channel.postMessage({ type: 'state-changed', tabId: S.tabId });
            } catch(e) { /* ignore */ }
        }
    }

    // Release editor role on unload
    function releaseChannel() {
        if (S.channel && !S.readOnly) {
            try {
                S.channel.postMessage({ type: 'release', tabId: S.tabId });
                S.channel.close();
            } catch(e) { /* ignore */ }
        }
    }

    // ===== File System Access API: Native Auto-Save =====
    var AUTO_SAVE_DB = 'diagram-fs-handles';
    var AUTO_SAVE_STORE = 'handles';
    var AUTO_SAVE_KEY = 'current-handle';

    function fsApiSupported() {
        return typeof window.showSaveFilePicker === 'function';
    }

    function openAutoSaveDB() {
        return new Promise(function(resolve, reject) {
            var req = indexedDB.open(AUTO_SAVE_DB, 1);
            req.onupgradeneeded = function() {
                req.result.createObjectStore(AUTO_SAVE_STORE);
            };
            req.onsuccess = function() { resolve(req.result); };
            req.onerror = function() { reject(req.error); };
        });
    }

    function storeFileHandle(handle) {
        return openAutoSaveDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(AUTO_SAVE_STORE, 'readwrite');
                tx.objectStore(AUTO_SAVE_STORE).put(handle, AUTO_SAVE_KEY);
                tx.oncomplete = function() { db.close(); resolve(); };
                tx.onerror = function() { db.close(); reject(tx.error); };
            });
        });
    }

    function loadFileHandle() {
        return openAutoSaveDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(AUTO_SAVE_STORE, 'readonly');
                var req = tx.objectStore(AUTO_SAVE_STORE).get(AUTO_SAVE_KEY);
                req.onsuccess = function() { db.close(); resolve(req.result || null); };
                req.onerror = function() { db.close(); reject(req.error); };
            });
        }).catch(function() { return null; });
    }

    function clearFileHandle() {
        return openAutoSaveDB().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(AUTO_SAVE_STORE, 'readwrite');
                tx.objectStore(AUTO_SAVE_STORE).delete(AUTO_SAVE_KEY);
                tx.oncomplete = function() { db.close(); resolve(); };
                tx.onerror = function() { db.close(); reject(tx.error); };
            });
        }).catch(function() {});
    }

    function writeToAutoSaveFile() {
        if (!S.autoSaveFileHandle) return Promise.resolve();
        // Check permission
        return S.autoSaveFileHandle.queryPermission({ mode: 'readwrite' }).then(function(state) {
            if (state !== 'granted') {
                return S.autoSaveFileHandle.requestPermission({ mode: 'readwrite' });
            }
            return state;
        }).then(function(state) {
            if (state !== 'granted') {
                S.autoSaveFileHandle = null;
                updateAutoSaveUI();
                logAction('Auto-save disabled: permission denied', 'sys');
                return;
            }
            var data = {
                shapes: S.shapes, connections: S.connections, nextId: S.nextId,
                nameCounters: S.nameCounters, connNameCounter: S.connNameCounter,
                zoom: S.zoom, panX: S.panX, panY: S.panY,
                canvasW: S.canvasW, canvasH: S.canvasH,
                projectName: S.projectName,
                metadata: S.metadata
            };
            return S.autoSaveFileHandle.createWritable().then(function(writable) {
                return writable.write(JSON.stringify(data, null, 2)).then(function() {
                    return writable.close();
                });
            });
        }).catch(function(err) {
            console.error('Auto-save write failed:', err);
            S.autoSaveFileHandle = null;
            updateAutoSaveUI();
            logAction('Auto-save failed: ' + err.message, 'sys');
        });
    }

    function updateAutoSaveUI() {
        var dot = document.getElementById('save-dot');
        var btn = document.getElementById('btn-save-file');
        if (!dot || !btn) return;
        if (S.autoSaveFileHandle) {
            dot.style.display = '';
            btn.title = 'Auto-saving to file. Click to download a backup.';
        } else {
            dot.style.display = 'none';
            btn.title = fsApiSupported() ? 'Save — opens auto-save (Chrome/Edge)' : 'Save Project (.json)';
        }
    }

    // Patch saveState to also write to auto-save file
    var _originalSaveState = saveState;
    saveState = function() {
        _originalSaveState();
        if (S.autoSaveFileHandle && !S.readOnly) {
            writeToAutoSaveFile();
        }
        broadcastStateChange();
    };

    function restoreAutoSaveHandle() {
        if (!fsApiSupported()) return;
        loadFileHandle().then(function(handle) {
            if (!handle) return;
            // Verify permission still holds
            return handle.queryPermission({ mode: 'readwrite' }).then(function(state) {
                if (state === 'granted') {
                    S.autoSaveFileHandle = handle;
                    updateAutoSaveUI();
                    logAction('Auto-save resumed: ' + handle.name, 'sys');
                } else {
                    // Try to re-request
                    return handle.requestPermission({ mode: 'readwrite' }).then(function(state2) {
                        if (state2 === 'granted') {
                            S.autoSaveFileHandle = handle;
                            updateAutoSaveUI();
                            logAction('Auto-save resumed: ' + handle.name, 'sys');
                        } else {
                            clearFileHandle();
                        }
                    });
                }
            });
        }).catch(function() {
            // Handle no longer valid — clear it
            clearFileHandle();
        });
    }

    // ===== Export =====
    function getContentBounds() {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        S.shapes.forEach(function(s) {
            if (s.x < minX) minX = s.x;
            if (s.y < minY) minY = s.y;
            if (s.x + s.width > maxX) maxX = s.x + s.width;
            if (s.y + s.height > maxY) maxY = s.y + s.height;
        });
        // Include anchors for connections
        S.connections.forEach(function(c) {
            var a = findShape(c.from), b = findShape(c.to);
            if (a && a.isAnchor) { if (a.x < minX) minX = a.x; if (a.y < minY) minY = a.y; if (a.x + a.width > maxX) maxX = a.x + a.width; if (a.y + a.height > maxY) maxY = a.y + a.height; }
            if (b && b.isAnchor) { if (b.x < minX) minX = b.x; if (b.y < minY) minY = b.y; if (b.x + b.width > maxX) maxX = b.x + b.width; if (b.y + b.height > maxY) maxY = b.y + b.height; }
        });
        if (!isFinite(minX)) return { x: 0, y: 0, w: 800, h: 600 };
        var pad = 40;
        return { x: minX - pad, y: minY - pad, w: maxX - minX + pad*2, h: maxY - minY + pad*2 };
    }

    function doExport(format, autoCrop) {
        var srcEl = document.getElementById('shapes-layer');
        var bnd = autoCrop ? getContentBounds() : { x: 0, y: 0, w: S.canvasW, h: S.canvasH };
        var scale = 2;
        var fileName = (S.projectName || 'diagram').replace(/[^a-z0-9_-]/gi, '_');

        // Build a temporary wrapper at the target bounds
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:absolute;top:0;left:0;width:'+bnd.w+'px;height:'+bnd.h+'px;overflow:hidden;';

        // Background: only for JPG, use theme canvas colour
        if (format === 'jpg') {
            var bg = document.createElement('div');
            bg.style.cssText = 'position:absolute;top:0;left:0;width:'+bnd.w+'px;height:'+bnd.h+'px;';
            var cc = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas-bg').trim() || '#1C1C20';
            bg.style.background = cc;
            wrapper.appendChild(bg);
        }

        // Connections SVG — single translated SVG with all paths
        var connSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        connSVG.setAttribute('width', bnd.w); connSVG.setAttribute('height', bnd.h);
        connSVG.style.cssText = 'position:absolute;top:0;left:0;';
        var connG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        connG.setAttribute('transform', 'translate('+(-bnd.x)+','+(-bnd.y)+')');
        S.connections.forEach(function(c) {
            var ep = connEndpoints(c); if (!ep) return;
            var d = 'M'+ep.x1+','+ep.y1+' L'+ep.x2+','+ep.y2;
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d); path.setAttribute('stroke', c.stroke);
            path.setAttribute('stroke-width', c.sw); path.setAttribute('fill', 'none');
            connG.appendChild(path);
            if (c.arrowEnd) {
                var a2 = Math.atan2(ep.y2 - ep.y1, ep.x2 - ep.x1);
                var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                poly.setAttribute('class', 'conn-arrow');
                poly.setAttribute('points', arrowHead(ep.x2, ep.y2, a2));
                poly.setAttribute('fill', c.stroke); connG.appendChild(poly);
            }
            if (c.arrowStart) {
                var a1 = Math.atan2(ep.y1 - ep.y2, ep.x1 - ep.x2);
                var poly2 = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                poly2.setAttribute('class', 'conn-arrow');
                poly2.setAttribute('points', arrowHead(ep.x1, ep.y1, a1));
                poly2.setAttribute('fill', c.stroke); connG.appendChild(poly2);
            }
        });
        connSVG.appendChild(connG); wrapper.appendChild(connSVG);

        // Shapes — clone and offset
        var shapeEls = [].slice.call(srcEl.querySelectorAll('.diagram-shape'));
        shapeEls.forEach(function(el) {
            var clone = el.cloneNode(true);
            clone.style.position = 'absolute';
            var curLeft = parseFloat(clone.style.left) || 0;
            var curTop = parseFloat(clone.style.top) || 0;
            clone.style.left = (curLeft - bnd.x) + 'px';
            clone.style.top = (curTop - bnd.y) + 'px';
            wrapper.appendChild(clone);
        });

        document.body.appendChild(wrapper);

        html2canvas(wrapper, { scale: scale, backgroundColor: null }).then(function(canvas2) {
            document.body.removeChild(wrapper);
            if (format === 'pdf') {
                // PDFs get a white background (can't truly be transparent)
                var outCanvas = document.createElement('canvas');
                outCanvas.width = bnd.w * scale; outCanvas.height = bnd.h * scale;
                var ctx = outCanvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
                ctx.drawImage(canvas2, 0, 0);
                var imgData = outCanvas.toDataURL('image/jpeg', 0.92);
                var { jsPDF } = window.jspdf;
                var pdf = new jsPDF(bnd.w > bnd.h ? 'l' : 'p', 'px', [bnd.w, bnd.h]);
                pdf.addImage(imgData, 'JPEG', 0, 0, bnd.w, bnd.h);
                pdf.save(fileName + '.pdf');
            } else if (format === 'jpg') {
                var link = document.createElement('a');
                link.download = fileName + '.jpg';
                link.href = canvas2.toDataURL('image/jpeg', 0.92);
                link.click();
            } else {
                // PNG — transparent background
                var link = document.createElement('a');
                link.download = fileName + '.png';
                link.href = canvas2.toDataURL('image/png');
                link.click();
            }
            logAction('Exported ' + format.toUpperCase() + ' (' + (autoCrop ? 'auto-crop' : 'full') + ')', 'sys');
        }).catch(function(err) {
            document.body.removeChild(wrapper);
            console.error('Export failed:', err);
            logAction('Export failed: ' + err.message, 'sys');
        });
    }
    function pushUndo() {
        S.undoStack.push(JSON.stringify({ shapes: S.shapes, connections: S.connections }));
        if (S.undoStack.length > CONFIG.maxUndo) S.undoStack.shift();
        S.redoStack = [];
        scheduleSave();
    }
    function undo() {
        if (!S.undoStack.length) return;
        S.redoStack.push(JSON.stringify({ shapes: S.shapes, connections: S.connections }));
        var d = JSON.parse(S.undoStack.pop());
        S.shapes = d.shapes; S.connections = d.connections; S.selection = [];
        logAction('Undo', 'sys');
        saveState();
        render();
    }
    function redo() {
        if (!S.redoStack.length) return;
        S.undoStack.push(JSON.stringify({ shapes: S.shapes, connections: S.connections }));
        var d = JSON.parse(S.redoStack.pop());
        S.shapes = d.shapes; S.connections = d.connections; S.selection = [];
        logAction('Redo', 'sys');
        saveState();
        render();
    }

    // ===== Shape ops =====
    function addShape(type, x, y, w, h) {
        // Auto-name: increment per-type counter
        if (!S.nameCounters[type]) S.nameCounters[type] = 0;
        S.nameCounters[type]++;
        var autoName = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + S.nameCounters[type];
        // Read current toolbar values as defaults for the new shape
        var s = {
            id: genId(), type: type, name: autoName, x: x, y: y, width: w, height: h, text: '',
            fill: fillInput.value, stroke: strokeInput.value,
            sw: parseInt(swInput.value) || 0,
            opacity: parseInt(opacityInput.value) / 100,
            fillOpacity: 1,
            strokeOpacity: 1,
            textColor: textColorInput.value,
            textAlign: 'center',
            locked: false, fontSize: CONFIG.defaultFontSize,
            textPad: 8,
            zHeight: 0,
            hidden: false
        };
        if (type === 'custom') { s.customSvg = ''; }
        S.shapes.push(s);
        scheduleSave();
        logAction('Created '+s.name, 'add');
        return s;
    }

    /** addConn – optionally pass fromRel/toRel {x,y} to lock the attachment point as a
     *  relative offset (0‑1) on the shape edge.  Omit for anchor‑circle endpoints. */
    function addConn(fromId, toId, arrowStart, arrowEnd, fromRel, toRel) {
        S.connNameCounter++;
        var autoName = 'Line ' + S.connNameCounter;
        var c = {
            id: cid(), name: autoName, from: fromId, to: toId,
            fromRel: fromRel || null, toRel: toRel || null,
            stroke: strokeInput.value,
            sw: parseInt(swInput.value) || 2,
            arrowStart: arrowStart || false,
            arrowEnd: arrowEnd || false
        };
        S.connections.push(c);
        scheduleSave();
        logAction('Connected '+shapeName(c.from)+' → '+shapeName(c.to), 'add');
    }

    function deleteShape(id) {
        var s = findShape(id);
        S.shapes = S.shapes.filter(function(s) { return s.id !== id; });
        S.selection = S.selection.filter(function(sid) { return sid !== id; });
        S.connections = S.connections.filter(function(c) { return c.from !== id && c.to !== id; });
        scheduleSave();
        if (s) logAction('Deleted '+s.name, 'del');
    }

    function deleteConn(id) {
        S.connections = S.connections.filter(function(c) { return c.id !== id; });
        S.selection = S.selection.filter(function(sid) { return sid !== id; });
        scheduleSave();
        logAction('Deleted '+connName(id), 'del');
    }

    function dup(id) {
        var o = findShape(id);
        if (!o) return;
        var copy = JSON.parse(JSON.stringify(o));
        copy.id = genId(); copy.x += CONFIG.dupOffset; copy.y += CONFIG.dupOffset;
        // Increment counter and rename the copy
        var t = copy.type;
        if (!S.nameCounters[t]) S.nameCounters[t] = 0;
        S.nameCounters[t]++;
        copy.name = t.charAt(0).toUpperCase() + t.slice(1) + ' ' + S.nameCounters[t];
        S.shapes.push(copy);
        logAction('Duplicated '+o.name+' → '+copy.name, 'add');
    }

    function copySelection() {
        var sIds = shapeSel();
        if (sIds.length === 0 && connSel().length === 0) return;
        // Deep-clone selected shapes
        var copiedShapes = sIds.map(function(id) {
            var s = findShape(id);
            return s ? JSON.parse(JSON.stringify(s)) : null;
        }).filter(Boolean);
        // Deep-clone connections that connect two selected shapes
        var copiedConnIds = {};
        sIds.forEach(function(id) { copiedConnIds[id] = true; });
        var copiedConns = S.connections.filter(function(c) {
            return copiedConnIds[c.from] && copiedConnIds[c.to];
        }).map(function(c) {
            return JSON.parse(JSON.stringify(c));
        });
        S.clipboard = { shapes: copiedShapes, connections: copiedConns };
        logAction('Copied ' + sIds.length + ' shape(s), ' + copiedConns.length + ' connection(s)', 'sys');
    }

    function pasteClipboard() {
        if (!S.clipboard || S.clipboard.shapes.length === 0) return;
        var idMap = {}; // oldId → newId
        var newShapes = [];
        S.clipboard.shapes.forEach(function(oldS) {
            var copy = JSON.parse(JSON.stringify(oldS));
            var newId = genId();
            idMap[copy.id] = newId;
            copy.id = newId;
            copy.x += CONFIG.pasteOffset;
            copy.y += CONFIG.pasteOffset;
            clampShape(copy);
            // Increment counter and rename the copy
            var t = copy.type;
            if (!S.nameCounters[t]) S.nameCounters[t] = 0;
            S.nameCounters[t]++;
            copy.name = t.charAt(0).toUpperCase() + t.slice(1) + ' ' + S.nameCounters[t];
            S.shapes.push(copy);
            newShapes.push(copy);
        });
        // Paste connections, remapping IDs
        S.clipboard.connections.forEach(function(oldC) {
            var cCopy = JSON.parse(JSON.stringify(oldC));
            cCopy.id = cid();
            cCopy.from = idMap[cCopy.from];
            cCopy.to = idMap[cCopy.to];
            if (cCopy.from && cCopy.to) {
                S.connections.push(cCopy);
            }
        });
        // Select the newly pasted shapes
        S.selection = newShapes.map(function(s) { return s.id; });
        logAction('Pasted ' + newShapes.length + ' shape(s)', 'add');
    }

    function toFront(id) {
        var s = findShape(id);
        if (!s) return;
        var maxZ = 0;
        S.shapes.forEach(function(sh) { if ((sh.zHeight || 0) > maxZ) maxZ = sh.zHeight || 0; });
        s.zHeight = maxZ + 1;
        logAction('Bring to front '+s.name, 'move');
    }
    function toBack(id) {
        var s = findShape(id);
        if (!s) return;
        var minZ = 0;
        S.shapes.forEach(function(sh) { if ((sh.zHeight || 0) < minZ) minZ = sh.zHeight || 0; });
        s.zHeight = minZ - 1;
        logAction('Send to back '+s.name, 'move');
    }
    function forward(id) {
        var s = findShape(id);
        if (!s) return;
        s.zHeight = (s.zHeight || 0) + 1;
        logAction('Bring forward '+s.name, 'move');
    }
    function backward(id) {
        var s = findShape(id);
        if (!s) return;
        s.zHeight = (s.zHeight || 0) - 1;
        logAction('Send backward '+s.name, 'move');
    }

    // ===== SVG generators =====
    function shapeSVG(s) {
        var w = s.width, h = s.height, fc = s.fill, sc = s.stroke, sw = s.sw;
        var fo = (s.fillOpacity != null ? s.fillOpacity : 1);
        var so = (s.strokeOpacity != null ? s.strokeOpacity : 1);
        var o = sw ? sw / 2 : 0;  // half-stroke inset so strokes don't clip
        // Full-size fill + inset stroke shape so outlines are fully visible within bounds
        switch (s.type) {
            case 'rect':
                return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'" fill-opacity="'+fo+'"/>' +
                       (sw ? '<rect x="'+o+'" y="'+o+'" width="'+(w-sw)+'" height="'+(h-sw)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'" rx="2"/>' : '');
            case 'roundRect':
                return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'" rx="8" fill-opacity="'+fo+'"/>' +
                       (sw ? '<rect x="'+o+'" y="'+o+'" width="'+(w-sw)+'" height="'+(h-sw)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'" rx="8"/>' : '');
            case 'circle':
                return '<ellipse cx="'+(w/2)+'" cy="'+(h/2)+'" rx="'+(w/2)+'" ry="'+(h/2)+'" fill="'+fc+'" fill-opacity="'+fo+'"/>' +
                       (sw ? '<ellipse cx="'+(w/2)+'" cy="'+(h/2)+'" rx="'+(w/2-o)+'" ry="'+(h/2-o)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'"/>' : '');
            case 'diamond':
                return '<polygon points="'+(w/2)+',0 '+w+','+(h/2)+' '+(w/2)+','+h+' 0,'+(h/2)+'" fill="'+fc+'" fill-opacity="'+fo+'"/>' +
                       (sw ? '<polygon points="'+(w/2)+','+o+' '+(w-o)+','+(h/2)+' '+(w/2)+','+(h-o)+' '+o+','+(h/2)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'"/>' : '');
            case 'triangle':
                return '<polygon points="'+(w/2)+',0 '+w+','+h+' 0,'+h+'" fill="'+fc+'" fill-opacity="'+fo+'"/>' +
                       (sw ? '<polygon points="'+(w/2)+','+o+' '+(w-o)+','+(h-o)+' '+o+','+(h-o)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'"/>' : '');
            case 'terminator':
                var rx = h/2;
                return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'" rx="'+rx+'" fill-opacity="'+fo+'"/>' +
                       (sw ? '<rect x="'+o+'" y="'+o+'" width="'+(w-sw)+'" height="'+(h-sw)+'" fill="none" stroke="'+sc+'" stroke-opacity="'+so+'" stroke-width="'+sw+'" rx="'+(rx-o)+'"/>' : '');
            case 'custom':
                var inner = (s.customSvg || '').trim();
                var cw = s.customW || (inner ? 100 : w);
                var ch = s.customH || (inner ? 100 : h);
                if (!inner) {
                    return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'" opacity="0.4"/>' +
                           '<text x="'+(w/2)+'" y="'+(h/2)+'" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="'+sc+'">Custom</text>';
                }
                // Strip outer <svg> wrapper from user content if present, so we
                // control the viewBox ourselves via customW/customH.
                var m = inner.match(/<svg\b[^>]*>/i);
                if (m) {
                    inner = inner.replace(/<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
                    // Try to read viewBox from the stripped tag to keep coords in sync
                    var vb = m[0].match(/viewBox\s*=\s*["']([^"']*)["']/i);
                    if (vb) {
                        var parts = vb[1].split(/[\s,]+/);
                        if (parts.length >= 4) {
                            var pw = parseFloat(parts[2]), ph = parseFloat(parts[3]);
                            if (pw > 0 && ph > 0 && (!s.customW || !s.customH)) {
                                s.customW = pw; s.customH = ph;
                                cw = pw; ch = ph;
                            }
                        }
                    }
                }
                // Nested SVG fills shape bounds exactly; preserveAspectRatio=none
                // stretches user coords (0..customW × 0..customH) to match shape size.
                return '<svg x="0" y="0" width="'+w+'" height="'+h+'" viewBox="0 0 '+cw+' '+ch+'" preserveAspectRatio="none" overflow="hidden">'+inner+'</svg>';
            default:
                return '<rect width="'+w+'" height="'+h+'" fill="'+fc+'"/>' +
                       (sw ? '<rect x="'+o+'" y="'+o+'" width="'+(w-sw)+'" height="'+(h-sw)+'" fill="none" stroke="'+sc+'" stroke-width="'+sw+'"/>' : '');
        }
    }

    /** Helper: given a shape and an absolute canvas point on its perimeter, return
     *  the relative offset {x,y} in 0‑1 range.  Clamped to stay on the edge. */
    function absToRel(shape, pt) {
        return {
            x: clamp((pt.x - shape.x) / shape.width, 0, 1),
            y: clamp((pt.y - shape.y) / shape.height, 0, 1)
        };
    }

    /** Helper: given a shape and a relative offset {x,y} (0‑1), return the absolute
     *  canvas position of that point on the shape's perimeter. */
    function relToAbs(shape, rel) {
        return {
            x: shape.x + rel.x * shape.width,
            y: shape.y + rel.y * shape.height
        };
    }

    function connEndpoints(c) {
        var a = findShape(c.from), b = findShape(c.to);
        if (!a || !b) return null;

        function ep(shape, rel) {
            if (shape.isAnchor || !rel) {
                // Anchor circle or legacy connection — use center or dynamic outline
                return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
            }
            return relToAbs(shape, rel);
        }

        var p1 = ep(a, c.fromRel);
        var p2 = ep(b, c.toRel);

        // For legacy connections without rel, project to outline facing the other end
        if (!a.isAnchor && !c.fromRel) p1 = getShapeOutlinePoint(a, p2.x, p2.y);
        if (!b.isAnchor && !c.toRel)   p2 = getShapeOutlinePoint(b, p1.x, p1.y);

        return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }

    function arrowHead(x, y, angle) {
        var sz = CONFIG.arrowSize;
        return x+','+y+' '+
            (x-sz*Math.cos(angle-CONFIG.arrowSpread))+','+(y-sz*Math.sin(angle-CONFIG.arrowSpread))+' '+
            (x-sz*Math.cos(angle+CONFIG.arrowSpread))+','+(y-sz*Math.sin(angle+CONFIG.arrowSpread));
    }

    // ===== Render =====
    // ===== Layouts =====
    function renderLayouts() {
        var container = document.getElementById('panel-layers');
        if (!container) return;
        // Sort shapes by zHeight ascending, then by array index for stability
        var sorted = S.shapes.slice().sort(function(a, b) {
            var dz = (a.zHeight || 0) - (b.zHeight || 0);
            if (dz !== 0) return dz;
            return S.shapes.indexOf(a) - S.shapes.indexOf(b);
        });
        var html = '';
        // Get shape type icon SVG
        function shapeIcon(type) {
            var icons = {
                rect: '<rect x="3" y="3" width="18" height="18" rx="2"/>',
                roundRect: '<rect x="3" y="3" width="18" height="18" rx="4"/>',
                circle: '<circle cx="12" cy="12" r="9"/>',
                diamond: '<path d="M12 3l9 9-9 9-9-9z"/>',
                triangle: '<path d="M12 3l9 15H3z"/>',
                terminator: '<rect x="3" y="3" width="18" height="18" rx="9"/>',
                line: '<line x1="3" y1="21" x2="21" y2="3"/>',
                text: '<path d="M3 7h18M12 4v16M5 20h14"/>'
            };
            return icons[type] || icons.rect;
        }
        var html = '<div class="layer-list">';
        sorted.forEach(function(s) {
            var name = s.name || s.id;
            var zh = s.zHeight || 0;
            var isHidden = s.hidden || false;
            var isSelected = S.selectedIds && S.selectedIds.indexOf(s.id) !== -1;
            var iconSvg = shapeIcon(s.type);
            html += '<div class="layer-item'+(isSelected ? ' active' : '')+'" data-id="'+s.id+'">';
            html += '<span class="layer-icon"><svg viewBox="0 0 24 24">'+iconSvg+'</svg></span>';
            html += '<span class="layer-name">'+escHtml(name)+'</span>';
            html += '<button class="layer-vis-toggle'+(isHidden ? ' hidden' : '')+'" title="'+(isHidden ? 'Show' : 'Hide')+'" data-id="'+s.id+'">';
            html += isHidden ? '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M14.12 14.12a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
            html += '</button>';
            html += '<input type="number" class="layer-z" value="'+zh+'" min="-999" max="999" data-id="'+s.id+'" title="Z-height">';
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function render() { renderShapes(); renderConns(); renderProps(); renderLayouts(); }



    function renderGrid() {
        var g = S.gridSize;
        var cw = S.canvasW, ch = S.canvasH;
        var cc = getComputedStyle(document.documentElement).getPropertyValue('--color-canvas-bg').trim() || '#1C1C20';
        var gridFill = '';
        if (S.showGrid) {
            gridFill = '<defs><pattern id="grid" width="'+g+'" height="'+g+'" patternUnits="userSpaceOnUse">'+
                       '<path d="M'+g+' 0 L0 0 0 '+g+'" fill="none" stroke="'+T.grid+'" stroke-width="1"/>'+
                       '</pattern></defs>'+
                       '<rect x="0" y="0" width="'+cw+'" height="'+ch+'" fill="'+cc+'"/>'+
                       '<rect x="0" y="0" width="'+cw+'" height="'+ch+'" fill="url(#grid)"/>';
        } else {
            gridFill = '<rect x="0" y="0" width="'+cw+'" height="'+ch+'" fill="'+cc+'"/>';
        }
        gridLayer.innerHTML =
            '<svg width="100%" height="100%" style="position:absolute;top:0;left:0;width:10000px;height:10000px">'+
            gridFill +
            '<rect x="0" y="0" width="'+cw+'" height="'+ch+'" fill="none" stroke="'+T.accent+'" stroke-width="2" stroke-dasharray="10,6" opacity="0.5"/>'+
            '</svg>';
    }

    // z-index helper: shapes get z-index based on zHeight sort position
    function shapeZ(idx) { return idx * 2 + 2; }
    function connZ(conn) {
        var a = findShape(conn.from), b = findShape(conn.to);
        var ai = a ? S.shapes.indexOf(a) : -1;
        var bi = b ? S.shapes.indexOf(b) : -1;
        var maxI = Math.max(ai, bi);
        return maxI >= 0 ? shapeZ(maxI) - 1 : 1;
    }

    function renderShapes() {
        shapesLayer.innerHTML = '';
        // Sort by zHeight ascending, then array index for stability
        var sortedShapes = S.shapes.slice().filter(function(s) { return !s.hidden; }).sort(function(a, b) {
            var dz = (a.zHeight || 0) - (b.zHeight || 0);
            if (dz !== 0) return dz;
            return S.shapes.indexOf(a) - S.shapes.indexOf(b);
        });
        sortedShapes.forEach(function(s, idx) {
            var el = document.createElement('div');
            el.className = 'diagram-shape' + (S.selection.includes(s.id) ? ' selected' : '') + (s.locked ? ' locked' : '');
            el.dataset.id = s.id;
            el.style.left = s.x+'px'; el.style.top = s.y+'px';
            el.style.width = s.width+'px'; el.style.height = s.height+'px';
            el.style.zIndex = shapeZ(idx);
            el.style.opacity = s.opacity;

            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('width', s.width);
            svg.setAttribute('height', s.height);
            svg.setAttribute('viewBox', '0 0 '+s.width+' '+s.height);
            svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
            svg.innerHTML = shapeSVG(s);
            el.appendChild(svg);

            if (s.text) {
                var align = s.textAlign || 'center';
                var t = document.createElement('div');
                t.className = 'shape-text shape-text-' + align;
                var pad = s.textPad || 0;
                if (align === 'top-left' || align === 'top-center' || align === 'top-right') t.style.top = pad + 'px';
                if (align === 'bottom-left' || align === 'bottom-center' || align === 'bottom-right') t.style.bottom = pad + 'px';
                if (align === 'top-left' || align === 'middle-left' || align === 'bottom-left') t.style.left = pad + 'px';
                if (align === 'top-right' || align === 'middle-right' || align === 'bottom-right') t.style.right = pad + 'px';
                t.textContent = s.text;
                t.style.fontSize = s.fontSize + 'px';
                t.style.color = s.textColor || '#111113';
                el.appendChild(t);
            }

            if (S.selection.includes(s.id) && !s.locked) {
                var hs = CONFIG.handleSize;
                ['nw','n','ne','e','se','s','sw','w'].forEach(function(pos) {
                    var h = document.createElement('div');
                    h.className = 'resize-handle ' + pos;
                    h.dataset.handle = pos;
                    var l = s.width/2 - hs, tp = s.height/2 - hs;
                    if (pos.includes('e')) l = s.width - hs;
                    else if (pos.includes('w')) l = -hs;
                    if (pos.includes('s')) tp = s.height - hs;
                    else if (pos.includes('n')) tp = -hs;
                    h.style.left = l+'px'; h.style.top = tp+'px';
                    el.appendChild(h);
                });
            }
            shapesLayer.appendChild(el);
        });
    }

    function renderConns() {
        // Remove old connection divs (they share shapesLayer with shapes)
        var oldConns = shapesLayer.querySelectorAll('.diagram-conn');
        for (var oi = 0; oi < oldConns.length; oi++) oldConns[oi].remove();

        S.connections.forEach(function(c) {
            var ep = connEndpoints(c);
            if (!ep) return;
            var d = 'M'+ep.x1+','+ep.y1+' L'+ep.x2+','+ep.y2;
            var sel = S.selection.includes(c.id);
            var stroke = sel ? (T.accent || '#2563EB') : c.stroke;
            var sw = sel ? (c.sw + 1) : c.sw;
            var arrowEls = '';
            if (c.arrowStart) {
                var a1 = Math.atan2(ep.y1 - ep.y2, ep.x1 - ep.x2);
                arrowEls += '<polygon class="conn-arrow" points="'+arrowHead(ep.x1, ep.y1, a1)+'" fill="'+stroke+'"/>';
            }
            if (c.arrowEnd) {
                var a2 = Math.atan2(ep.y2 - ep.y1, ep.x2 - ep.x1);
                arrowEls += '<polygon class="conn-arrow" points="'+arrowHead(ep.x2, ep.y2, a2)+'" fill="'+stroke+'"/>';
            }
            var el = document.createElement('div');
            el.className = 'diagram-conn';
            el.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:'+connZ(c)+';pointer-events:none;';
            el.innerHTML = '<svg style="position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible">'+
                '<path d="'+d+'" stroke="'+stroke+'" stroke-width="'+sw+'" fill="none"'+
                (sel ? ' class="conn-sel"' : '')+'/>'+arrowEls+'</svg>';
            shapesLayer.appendChild(el);
        });
    }

    function syncStyleControlsToShape(s) {
        fillInput.value = s.fill;
        strokeInput.value = s.stroke;
        swInput.value = s.sw;
        opacityInput.value = Math.round(s.opacity * 100);
        textColorInput.value = s.textColor || '#111113';
        propFill.value = s.fill;
        propStroke.value = s.stroke;
        propSw.value = s.sw;
        propOpacity.value = Math.round(s.opacity * 100);
        if (propFillOpacity) propFillOpacity.value = Math.round((s.fillOpacity != null ? s.fillOpacity : 1) * 100);
        if (propStrokeOpacity) propStrokeOpacity.value = Math.round((s.strokeOpacity != null ? s.strokeOpacity : 1) * 100);
        propTextColor.value = s.textColor || '#111113';
        propFontSize.value = s.fontSize || CONFIG.defaultFontSize;
        propTextAlign.value = s.textAlign || 'center';
        propTextPad.value = s.textPad || 0;
    }

    function syncStyleControlsToConn(c) {
        connColor.value = c.stroke;
        connWidth.value = c.sw;
        connArrowStart.checked = c.arrowStart || false;
        connArrowEnd.checked = c.arrowEnd || false;
    }

    function renderProps() {
        var shapeEls = propsPanel.querySelectorAll('.panel-shape');
        var connEls  = propsPanel.querySelectorAll('.panel-conn');
        var projEl   = propsPanel.querySelector('.panel-project');
        var customEl = propsPanel.querySelector('.panel-custom');
        var sIds = shapeSel(), cIds = connSel();

        if (cIds.length === 1 && sIds.length === 0) {
            var c = findConn(cIds[0]);
            if (!c) { propsPanel.classList.add('hidden'); return; }
            propsPanel.classList.remove('hidden');
            panelTitle.textContent = 'Connection';
            projEl.classList.add('hidden');
            customEl.classList.add('hidden');
            shapeEls.forEach(function(el) { el.classList.add('hidden'); });
            connEls.forEach(function(el) { el.classList.remove('hidden'); });
            connNameInput.value = c.name || '';
            syncStyleControlsToConn(c);
        } else if (sIds.length === 1 && cIds.length === 0) {
            var s = findShape(sIds[0]);
            if (!s) { propsPanel.classList.add('hidden'); return; }
            propsPanel.classList.remove('hidden');
            panelTitle.textContent = s.type === 'custom' ? 'Custom Shape' : 'Shape';
            projEl.classList.add('hidden');
            shapeEls.forEach(function(el) { el.classList.remove('hidden'); });
            connEls.forEach(function(el) { el.classList.add('hidden'); });
            // Style section (fill/outline/sw/opacity/textColor) — hidden for custom shapes
            var styleEl = propsPanel.querySelector('.panel-shape-style');
            if (s.type === 'custom') {
                customEl.classList.remove('hidden');
                if (styleEl) styleEl.classList.add('hidden');
                customSvgCode.value = s.customSvg || '';
                customVbW.value = s.customW || '';
                customVbH.value = s.customH || '';
            } else {
                customEl.classList.add('hidden');
                if (styleEl) styleEl.classList.remove('hidden');
            }
            propX.value = Math.round(s.x);
            propY.value = Math.round(s.y);
            propWidth.value = s.width;
            propHeight.value = s.height;
            propText.value = s.text;
            propTextAlign.value = s.textAlign || 'center';
            propNameInput.value = s.name || '';
            propZHeight.value = s.zHeight || 0;
            propTextPad.value = s.textPad || 0;
            syncStyleControlsToShape(s);
        } else {
            // Show project properties
            propsPanel.classList.remove('hidden');
            panelTitle.textContent = 'Project';
            projEl.classList.remove('hidden');
            customEl.classList.add('hidden');
            shapeEls.forEach(function(el) { el.classList.add('hidden'); });
            connEls.forEach(function(el) { el.classList.add('hidden'); });
            projectNameInput.value = S.projectName || '';
            canvasWidth.value = S.canvasW;
            canvasHeight.value = S.canvasH;
        }
    }

    function applyTransform() {
        canvas.style.transform = 'translate('+S.panX+'px, '+S.panY+'px) scale('+S.zoom+')';
        zoomDisplay.textContent = Math.round(S.zoom * 100) + '%';
    }

    function updateCursor() {
        var map = { select: 'default', text: 'text' };
        container.style.cursor = map[S.tool] || 'crosshair';
    }

    // ===== Style application =====
    function applyStyleToSelected(prop, val) {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s[prop] = val;
        });
        render();
    }

    // ===== Text editing =====
    function startTextEdit(shapeId) {
        var s = findShape(shapeId);
        if (!s) return;
        textInput.value = s.text;
        textInput.style.fontSize = s.fontSize + 'px';
        textEditor.classList.add('visible');
        var cr = container.getBoundingClientRect();
        textEditor.style.left = (cr.left + (s.x + s.width/2) * S.zoom + S.panX) + 'px';
        textEditor.style.top = (cr.top + (s.y + s.height/2) * S.zoom + S.panY) + 'px';
        textInput.focus();
    }

    // ===== Line drawing =====
    /** Called when the user clicks a shape with the line tool. Shows a snap at the
     *  start point immediately and draws a temporary preview line. */
    function startDrawingFromShape(shape, pos) {
        var ep = getShapeOutlinePoint(shape, pos.x, pos.y);
        S.drawStart.x = ep.x;
        S.drawStart.y = ep.y;
        var ac = T.accent || '#2563EB';
        previewLayer.innerHTML = '<div class="snap-highlight" style="left:'+shape.x+'px;top:'+shape.y+'px;width:'+shape.width+'px;height:'+shape.height+'px;box-shadow:0 0 0 2px '+ac+', 0 0 16px rgba(37,99,235,0.3)"></div>'+
            '<svg style="position:absolute;top:0;left:0;width:100%;height:100%"><path d="M'+ep.x+','+ep.y+' L'+pos.x+','+pos.y+'" stroke="'+ac+'" stroke-width="2" stroke-dasharray="6,4" fill="none"/></svg>';
        console.debug('startDrawingFromShape', shape.type, 'ep:', ep.x, ep.y, 'accent:', ac);
    }

    // ===== Pointer: pointerdown (unified mouse + touch) =====
    container.addEventListener('pointerdown', function(e) {
        // Read-only mode: block all canvas interactions
        if (S.readOnly) return;
        // Track pointer for pinch-to-zoom
        S.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
        var ptrCount = Object.keys(S.pointers).length;
        if (ptrCount >= 2) {
            // Cancel any in-progress single-pointer action
            S.isDragging = false; S.isResizing = false; S.isDrawing = false;
            S.isDraggingConn = false; S.isSelecting = false;
            previewLayer.innerHTML = '';
            // Start pinch
            var ptrs = Object.values(S.pointers);
            var dxPinch = ptrs[1].x - ptrs[0].x;
            var dyPinch = ptrs[1].y - ptrs[0].y;
            S.pinchStart = {
                dist: Math.sqrt(dxPinch * dxPinch + dyPinch * dyPinch),
                zoom: S.zoom, panX: S.panX, panY: S.panY,
                cx: (ptrs[0].x + ptrs[1].x) / 2, cy: (ptrs[0].y + ptrs[1].y) / 2
            };
            e.preventDefault();
            return;
        }

        // If text editor is open, clicking the canvas should commit the text first.
        // blur fires after pointerdown, but pointerdown can deselectAll() first —
        // which makes the blur handler skip the save.  Commit eagerly here.
        if (textEditor.classList.contains('visible')) {
            var sIds = shapeSel();
            if (sIds.length === 1) {
                var editShape = findShape(sIds[0]);
                if (editShape) { editShape.text = textInput.value; logAction('Text: "'+textInput.value+'"', 'edit'); }
            }
            textEditor.classList.remove('visible');
            pushUndo(); render();
            // Fall through — let the rest of pointerdown process normally
        }
        if (e.button === 1) {
            S.isPanning = true;
            S.panStart = { x: e.clientX, y: e.clientY };
            container.style.cursor = 'grabbing';
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }
        // Right-click: deferred pan — show menu immediately, start pan only on drag
        if (e.button === 2 && !S.isDragging && !S.isResizing && !S.isDraggingConn) {
            S._rightClickStart = { x: e.clientX, y: e.clientY };
            S._rightClickMoved = false;
            showContextMenuAt(e.clientX, e.clientY);
            return;
        }
        if (e.button !== 0) return;

        var pos = toCanvas(e.clientX, e.clientY);
        var sx = snap(pos.x), sy = snap(pos.y);

        // 1. Check shapes (in paint order — last in array = topmost)
        var els = [].slice.call(shapesLayer.querySelectorAll('.diagram-shape')).reverse();
        var hit = null, hitHandle = null;
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var s = findShape(el.dataset.id);
            if (!s) continue;
            var r = el.getBoundingClientRect();
            var hitBounds = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            // Check resize handles even when cursor is slightly outside the shape bounds
            // (handles extend beyond the bounding box)
            if (S.selection.includes(s.id) && !s.locked) {
                var handlePad = CONFIG.handleGrabPx * S.zoom;
                var nearHandle = e.clientX >= r.left - handlePad && e.clientX <= r.right + handlePad &&
                                 e.clientY >= r.top - handlePad && e.clientY <= r.bottom + handlePad;
                if (nearHandle) {
                    var handles = el.querySelectorAll('.resize-handle');
                    for (var j = 0; j < handles.length; j++) {
                        var h2 = handles[j];
                        var hl = parseFloat(h2.style.left), ht = parseFloat(h2.style.top);
                        if (Math.abs((e.clientX - r.left)/S.zoom - hl - CONFIG.handleSize) < CONFIG.handleGrabPx &&
                            Math.abs((e.clientY - r.top)/S.zoom - ht - CONFIG.handleSize) < CONFIG.handleGrabPx) {
                            hitHandle = h2; break;
                        }
                    }
                    if (hitHandle) { hit = s; break; }
                }
            }
            if (!hitHandle && !hitBounds) continue;
            hit = s; break;
        }

        if (hitHandle) {
            S.isResizing = true;
            S.resizeHandle = hitHandle.dataset.handle;
            S.resizeStart = { mx: pos.x, my: pos.y, sx: hit.x, sy: hit.y, sw: hit.width, sh: hit.height };
            select(hit.id, e.shiftKey);
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }
        if (hit) {
            // === INTERCEPT: connection endpoint takes priority over shape ===
            // When a user clicks near where a line attaches to a shape, the click
            // is inside the shape's bounding box. The shape hit test above catches
            // it first. We must check for nearby connection endpoints and intercept
            // BEFORE processing it as a shape click/drag.
            var interceptConn = findConnAt(pos);
            if (interceptConn && S.tool === 'select') {
                var iEp = connEndpoints(interceptConn);
                if (iEp) {
                    var iD1 = Math.hypot(iEp.x1 - pos.x, iEp.y1 - pos.y);
                    var iD2 = Math.hypot(iEp.x2 - pos.x, iEp.y2 - pos.y);
                    var iThresh = CONFIG.snapPx / S.zoom;
                    if (iD1 < iThresh || iD2 < iThresh) {
                        // User clicked near a connection endpoint → drag the endpoint, not the shape
                        select(interceptConn.id, e.shiftKey);
                        S.isDraggingConn = true;
                        S.dragConnId = interceptConn.id;
                        S.dragStart = { x: pos.x, y: pos.y };
                        S.dragConnEnd = iD1 < iD2 ? 'from' : 'to';
                        console.debug('intercepted shape click for conn endpoint', S.dragConnEnd);
                        e.preventDefault();
                        container.setPointerCapture(e.pointerId);
                        return;
                    } else {
                        // Connection body over shape — drag the connection, not the shape
                        select(interceptConn.id, e.shiftKey);
                        S.isDraggingConn = true;
                        S.dragConnId = interceptConn.id;
                        S.dragStart = { x: pos.x, y: pos.y };
                        S.dragConnEnd = null;
                        var _fa = findShape(interceptConn.from), _fb = findShape(interceptConn.to);
                        S.dragConnAnchors = [
                            (_fa && _fa.isAnchor) ? { x: _fa.x, y: _fa.y } : null,
                            (_fb && _fb.isAnchor) ? { x: _fb.x, y: _fb.y } : null
                        ];
                        console.debug('intercepted shape click for conn body drag');
                        e.preventDefault();
                        container.setPointerCapture(e.pointerId);
                        return;
                    }
                }
            }

            // Line tool always draws — click on a shape to start a line from its outline
            if (S.tool === 'line') {
                console.debug('line tool: clicked shape', hit.type, 'at', pos.x, pos.y);
                S.isDrawing = true;
                S.drawStart = { x: pos.x, y: pos.y };
                S.drawStartShapeId = hit.id;
                startDrawingFromShape(hit, pos);
                e.preventDefault();
                container.setPointerCapture(e.pointerId);
                return;
            }
            select(hit.id, e.shiftKey);
            if (!hit.locked) {
                S.isDragging = true;
                S.dragStart = { x: pos.x, y: pos.y };
                S.dragOrigin = shapeSel().map(function(id) {
                    var sh = findShape(id);
                    return sh ? { x: sh.x, y: sh.y } : null;
                }).filter(Boolean);
            }
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }

        // 2. Check connections
        var conn = findConnAt(pos);
        if (conn) {
            select(conn.id, e.shiftKey);
            S.isDraggingConn = true;
            S.dragConnId = conn.id;
            S.dragStart = { x: pos.x, y: pos.y };

            // Determine if click is on an endpoint or the body
            // Endpoint threshold must be generous so clicks on the visible line-end always register
            var epDrag = connEndpoints(conn);
            if (epDrag) {
                var dFrom = Math.hypot(epDrag.x1 - pos.x, epDrag.y1 - pos.y);
                var dTo   = Math.hypot(epDrag.x2 - pos.x, epDrag.y2 - pos.y);
                var endThresh = CONFIG.snapPx / S.zoom;
                if (dFrom < endThresh || dTo < endThresh) {
                    // Endpoint drag — snap to shapes
                    S.dragConnEnd = dFrom < dTo ? 'from' : 'to';
                    console.debug('dragging conn endpoint', S.dragConnEnd, 'dFrom:', dFrom.toFixed(1), 'dTo:', dTo.toFixed(1));
                } else {
                    // Body drag — move whole line, but still snap on release
                    S.dragConnEnd = null;
                    var fa = findShape(conn.from), fb = findShape(conn.to);
                    S.dragConnAnchors = [
                        (fa && fa.isAnchor) ? { x: fa.x, y: fa.y } : null,
                        (fb && fb.isAnchor) ? { x: fb.x, y: fb.y } : null
                    ];
                }
            } else {
                // Orphaned connection (missing shapes) — body drag with no anchors
                S.dragConnEnd = null;
                S.dragConnAnchors = [null, null];
            }
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }

        // 3. Nothing hit — start new action based on tool
        if (!e.shiftKey) deselectAll();

        if (pendingShape) {
            // Click-and-drag to size a shape
            S.isDrawing = true;
            S.drawStart = { x: sx, y: sy };
            S.drawStartShapeId = null;
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }

        if (S.tool === 'select') {
            S.isSelecting = true;
            S.selectStart = { x: sx, y: sy };
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            return;
        }
        if (S.tool === 'text') {
            var ts = addShape('rect', sx, sy, 150, 50);
            ts.text = 'Text';
            ts.fill = 'transparent'; ts.stroke = 'transparent'; ts.sw = 0;
            pushUndo();
            select(ts.id);
            render();
            startTextEdit(ts.id);
            return;
        }
        S.isDrawing = true;
        S.drawStart = { x: sx, y: sy };
        S.drawStartShapeId = null;
        console.debug('line tool: drawing from empty canvas at', sx, sy);
        e.preventDefault();
        container.setPointerCapture(e.pointerId);
        return;
    // Long-press timer for touch right-click — only for touch, when nothing grabbed
    if (e.pointerType === 'touch' && S.tool === 'select' && S.pinchStart === null && !textEditor.classList.contains('visible')) {
        S._longPressStart = { x: e.clientX, y: e.clientY };
        S._longPressTimer = setTimeout(function() {
            var lx = S._longPressStart.x, ly = S._longPressStart.y;
            var els = [].slice.call(shapesLayer.querySelectorAll('.diagram-shape')).reverse();
            var found = false;
            for (var li = 0; li < els.length; li++) {
                var lr = els[li].getBoundingClientRect();
                if (lx >= lr.left && lx <= lr.right && ly >= lr.top && ly <= lr.bottom) {
                    var lsid = els[li].dataset.id;
                    if (!S.selection.includes(lsid)) select(lsid);
                    contextMenu.style.left = lx + 'px';
                    contextMenu.style.top = ly + 'px';
                    contextMenu.classList.remove('hidden');
                    found = true; break;
                }
            }
            if (!found) {
                var lpos = toCanvas(lx, ly);
                var lconn = findConnAt(lpos);
                if (lconn) {
                    if (!S.selection.includes(lconn.id)) select(lconn.id);
                    contextMenu.style.left = lx + 'px';
                    contextMenu.style.top = ly + 'px';
                    contextMenu.classList.remove('hidden');
                }
            }
            delete S._longPressTimer;
            delete S._longPressStart;
        }, 500);
    }
});

    // ===== Pointer: pointermove (unified mouse + touch) =====
    container.addEventListener('pointermove', function(e) {
        // Update pointer tracking for pinch
        S.pointers[e.pointerId] = { x: e.clientX, y: e.clientY };

        // Cancel long-press if finger moved too far
        if (S._longPressStart && (Math.abs(e.clientX - S._longPressStart.x) > 12 || Math.abs(e.clientY - S._longPressStart.y) > 12)) {
            clearTimeout(S._longPressTimer);
            delete S._longPressTimer;
            delete S._longPressStart;
        }

        // Right-click deferred pan: check if moved enough to start panning
        if (S._rightClickStart && !S._rightClickMoved) {
            var dx = e.clientX - S._rightClickStart.x;
            var dy = e.clientY - S._rightClickStart.y;
            if (Math.sqrt(dx * dx + dy * dy) > 5) {
                S._rightClickMoved = true;
                contextMenu.classList.add('hidden');
                S.isPanning = true;
                S.panStart = { x: e.clientX, y: e.clientY };
                container.style.cursor = 'grabbing';
            }
        }

        // Handle pinch-to-zoom + two-finger pan
        if (S.pinchStart && Object.keys(S.pointers).length >= 2) {
            var ptrs = Object.values(S.pointers);
            var dxP = ptrs[1].x - ptrs[0].x;
            var dyP = ptrs[1].y - ptrs[0].y;
            var newDist = Math.sqrt(dxP * dxP + dyP * dyP);
            var scale = newDist / S.pinchStart.dist;
            var r = container.getBoundingClientRect();
            // Current midpoint in container coords
            var cx = (ptrs[0].x + ptrs[1].x) / 2 - r.left;
            var cy = (ptrs[0].y + ptrs[1].y) / 2 - r.top;
            // Initial midpoint in container coords
            var icx = S.pinchStart.cx - r.left;
            var icy = S.pinchStart.cy - r.top;
            var newZoom = clamp(S.pinchStart.zoom * scale, CONFIG.minZoom, CONFIG.maxZoom);
            var zFrac = newZoom / S.pinchStart.zoom;
            // 1) Zoom about the initial midpoint
            S.panX = icx - (icx - S.pinchStart.panX) * zFrac;
            S.panY = icy - (icy - S.pinchStart.panY) * zFrac;
            S.zoom = newZoom;
            // 2) Pan to track midpoint movement (direct translation in container space)
            S.panX += cx - icx;
            S.panY += cy - icy;
            applyTransform();
            return;
        }

        var pos = toCanvas(e.clientX, e.clientY);
        var sx = snap(pos.x), sy = snap(pos.y);

        if (S.isPanning) {
            S.panX += e.clientX - S.panStart.x;
            S.panY += e.clientY - S.panStart.y;
            S.panStart = { x: e.clientX, y: e.clientY };
            applyTransform();
            return;
        }
        if (S.isResizing) {
            var rs = S.resizeStart, h = S.resizeHandle;
            var dx = pos.x - rs.mx, dy = pos.y - rs.my;
            shapeSel().forEach(function(id) {
                var s = findShape(id);
                if (!s) return;
                var nw = rs.sw, nh = rs.sh, nx = s.x, ny = s.y;
                if (h.includes('e')) nw = Math.max(CONFIG.minShapeSize, rs.sw + dx);
                if (h.includes('w')) { nw = Math.max(CONFIG.minShapeSize, rs.sw - dx); nx = rs.sx + rs.sw - nw; }
                if (h.includes('s')) nh = Math.max(CONFIG.minShapeSize, rs.sh + dy);
                if (h.includes('n')) { nh = Math.max(CONFIG.minShapeSize, rs.sh - dy); ny = rs.sy + rs.sh - nh; }
                s.x = snap(nx); s.y = snap(ny); s.width = snap(nw); s.height = snap(nh);
                clampShape(s);
            });
            render();
            return;
        }
        if (S.isDraggingConn) {
            var dx3 = pos.x - S.dragStart.x, dy3 = pos.y - S.dragStart.y;
            var connD = findConn(S.dragConnId);
            if (!connD) return;

            if (S.dragConnEnd) {
                // === Endpoint drag — detach, move, snap-preview ===
                var endId = S.dragConnEnd === 'from' ? connD.from : connD.to;
                var fixedId = S.dragConnEnd === 'from' ? connD.to : connD.from;
                var endShape = findShape(endId);
                var fixedShape = findShape(fixedId);

                // Detach from real shape on first move
                if (endShape && !endShape.isAnchor) {
                    var fcx = fixedShape ? fixedShape.x + fixedShape.width/2 : pos.x;
                    var fcy = fixedShape ? fixedShape.y + fixedShape.height/2 : pos.y;
                    var op = getShapeOutlinePoint(endShape, fcx, fcy);
                    var anchor = addShape('circle', op.x - 5, op.y - 5, 10, 10);
                    anchor.fill = 'transparent'; anchor.stroke = 'transparent'; anchor.sw = 0; anchor.isAnchor = true;
                    if (S.dragConnEnd === 'from') { connD.from = anchor.id; connD.fromRel = null; }
                    else { connD.to = anchor.id; connD.toRel = null; }
                    endShape = anchor;
                    logAction('Detached '+connName(connD.id)+' '+S.dragConnEnd+' from shape', 'move');
                    console.debug('detached endpoint from shape, created anchor', anchor.id);
                }
                if (endShape && endShape.isAnchor) {
                    endShape.x = snap(pos.x - 5); endShape.y = snap(pos.y - 5);
                }

                var snapThresh3 = CONFIG.snapPx / S.zoom;
                var nearShape = findNearestShape(pos, snapThresh3);
                var ac3 = T.accent || '#2563EB';
                var preview = '';
                var portR = 14 / S.zoom; // port snap radius in canvas coords
                if (nearShape) {
                    preview = '<div class="snap-highlight" style="left:'+nearShape.x+'px;top:'+nearShape.y+'px;width:'+nearShape.width+'px;height:'+nearShape.height+'px;box-shadow:0 0 0 3px '+ac3+',0 0 16px rgba(37,99,235,0.3)"></div>';
                    // Draw 8 port indicators
                    var ports = shapePorts(nearShape);
                    var draggedEp = endId === connD.from ? { x: pos.x, y: pos.y } : { x: pos.x, y: pos.y };
                    if (endShape && endShape.isAnchor) { draggedEp.x = endShape.x + 5; draggedEp.y = endShape.y + 5; }
                    var nearPort = nearestPort(draggedEp, nearShape, portR);
                    ports.forEach(function(p) {
                        var isNearest = nearPort && p.x === nearPort.port.x && p.y === nearPort.port.y;
                        preview += '<div style="position:absolute;left:'+(p.x-4)+'px;top:'+(p.y-4)+'px;width:8px;height:8px;border-radius:50%;border:2px solid '+ac3+';background:'+(isNearest ? ac3 : 'transparent')+';opacity:'+(isNearest ? '1' : '0.5')+'"></div>';
                    });
                }
                var epLive = connEndpoints(connD);
                preview += '<svg style="position:absolute;top:0;left:0;width:100%;height:100%"><path d="M'+epLive.x1+','+epLive.y1+' L'+epLive.x2+','+epLive.y2+'" stroke="'+ac3+'" stroke-width="2" stroke-dasharray="6,4" fill="none"/></svg>';
                previewLayer.innerHTML = preview;
            } else {
                // === Body drag — move all anchor-circle endpoints by delta ===
                var da = S.dragConnAnchors;
                var fa2 = findShape(connD.from), fb2 = findShape(connD.to);
                if (fa2 && fa2.isAnchor && da[0]) { fa2.x = snap(da[0].x + dx3); fa2.y = snap(da[0].y + dy3); }
                if (fb2 && fb2.isAnchor && da[1]) { fb2.x = snap(da[1].x + dx3); fb2.y = snap(da[1].y + dy3); }
            }
            render();
            return;
        }
        if (S.isDragging) {
            var dx2 = pos.x - S.dragStart.x, dy2 = pos.y - S.dragStart.y;
            shapeSel().forEach(function(id, i) {
                var s = findShape(id);
                if (!s || !S.dragOrigin[i]) return;
                s.x = snap(S.dragOrigin[i].x + dx2);
                s.y = snap(S.dragOrigin[i].y + dy2);
                clampShape(s);
            });
            render();
            return;
        }
        if (S.isSelecting) {
            previewLayer.innerHTML = '';
            var x = Math.min(S.selectStart.x, sx), y = Math.min(S.selectStart.y, sy);
            var w = Math.abs(sx - S.selectStart.x), h2y = Math.abs(sy - S.selectStart.y);
            previewLayer.innerHTML = '<div class="selection-box" style="left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h2y+'px"></div>';
            S.selection = S.shapes.filter(function(s) {
                return s.x < x+w && s.x+s.width > x && s.y < y+h2y && s.y+s.height > y;
            }).map(function(s) { return s.id; });
            return;
        }
        if (S.isDrawing) {
            if (pendingShape) {
                // Shape preview during click-drag
                var x = Math.min(S.drawStart.x, sx);
                var y = Math.min(S.drawStart.y, sy);
                var w = Math.abs(sx - S.drawStart.x);
                var h = Math.abs(sy - S.drawStart.y);
                var ac2 = T.accent || '#2563EB';
                previewLayer.innerHTML = '<div style="position:absolute;left:'+x+'px;top:'+y+'px;width:'+w+'px;height:'+h+'px;border:2px dashed '+ac2+';background:rgba(37,99,235,0.1)"></div>';
            } else {
                // Line preview
                var snapThresh = CONFIG.snapPx / S.zoom;
                var ss2 = S.drawStartShapeId ? findShape(S.drawStartShapeId) : findNearestShape(S.drawStart, snapThresh);
                var se2 = findNearestShape({ x: sx, y: sy }, snapThresh);
                var lx1 = S.drawStart.x, ly1 = S.drawStart.y;
                var lx2 = sx, ly2 = sy;
                if (ss2) { var op = getShapeOutlinePoint(ss2, lx2, ly2); lx1 = op.x; ly1 = op.y; }
                if (se2) { var op2 = getShapeOutlinePoint(se2, lx1, ly1); lx2 = op2.x; ly2 = op2.y; }
                var ac3 = T.accent || '#2563EB';
                var highlight = '';
                if (ss2) highlight += '<div class="snap-highlight" style="left:'+ss2.x+'px;top:'+ss2.y+'px;width:'+ss2.width+'px;height:'+ss2.height+'px;box-shadow:0 0 0 3px '+ac3+',0 0 16px rgba(37,99,235,0.3)"></div>';
                if (se2 && se2 !== ss2) highlight += '<div class="snap-highlight" style="left:'+se2.x+'px;top:'+se2.y+'px;width:'+se2.width+'px;height:'+se2.height+'px;box-shadow:0 0 0 3px '+ac3+',0 0 16px rgba(37,99,235,0.3)"></div>';
                previewLayer.innerHTML = highlight + '<svg style="position:absolute;top:0;left:0;width:100%;height:100%"><path d="M'+lx1+','+ly1+' L'+lx2+','+ly2+'" stroke="'+ac3+'" stroke-width="2" stroke-dasharray="6,4" fill="none"/></svg>';
            }
        }
    });

    // ===== Pointer: pointerup (unified mouse + touch) =====
    container.addEventListener('pointerup', function(e) {
        // Cancel long-press timer on finger lift
        if (S._longPressTimer) {
            clearTimeout(S._longPressTimer);
            delete S._longPressTimer;
            delete S._longPressStart;
        }
        // Clean up right-click deferred pan state
        if (S._rightClickTimer) {
            clearTimeout(S._rightClickTimer);
            delete S._rightClickTimer;
        }
        delete S._rightClickStart;
        delete S._rightClickMoved;
        // Clean up pointer tracking
        delete S.pointers[e.pointerId];

        // End pinch
        if (S.pinchStart && Object.keys(S.pointers).length < 2) {
            S.pinchStart = null;
            render();
        }

        if (S.isPanning) { S.isPanning = false; updateCursor(); container.releasePointerCapture(e.pointerId); return; }
        if (S.isResizing || S.isDragging) {
            if (S.isDragging) logAction('Moved '+shapeSel().length+' shape(s)', 'move');
            if (S.isResizing) logAction('Resized '+shapeSel().map(shapeName).join(', '), 'edit');
            S.isResizing = false; S.isDragging = false;
            pushUndo(); render();
            container.releasePointerCapture(e.pointerId);
            return;
        }
        if (S.isDraggingConn) {
            var cd = findConn(S.dragConnId);

            if (S.dragConnEnd && cd) {
                // === Endpoint drag — snap to shape if near ===
                var endKey = S.dragConnEnd;  // 'from' or 'to'
                var endId = cd[endKey];
                var es = findShape(endId);
                var posC = toCanvas(e.clientX, e.clientY);
                // Use actual anchor center (not grid-snapped) for snap detection
                var epX = posC.x, epY = posC.y;
                if (es && es.isAnchor) { epX = es.x + 5; epY = es.y + 5; }
                else if (es) { epX = es.x + es.width/2; epY = es.y + es.height/2; }
                var snapShape = findNearestShape({ x: epX, y: epY }, CONFIG.snapPx / S.zoom);
                if (snapShape) {
                    // Skip re-snap if already attached to this same shape.
                    // Without this guard, clicking a connection endpoint would
                    // recompute fromRel/toRel using the shape center, silently
                    // shifting the attachment point.
                    if (es && !es.isAnchor && es.id === snapShape.id) {
                        // Click without drag — attachment already locked via fromRel/toRel
                    } else {
                        // Check for port snap first (within ~14px canvas coords)
                        var portSnap = nearestPort({ x: epX, y: epY }, snapShape, 14 / S.zoom);
                        if (portSnap) {
                            var rel = absToRel(snapShape, portSnap.port);
                            cd[endKey] = snapShape.id;
                            if (endKey === 'from') cd.fromRel = rel;
                            else cd.toRel = rel;
                            if (es && es.isAnchor) { deleteShape(es.id); }
                            logAction('Attached '+connName(cd.id)+' '+endKey+' to '+shapeName(snapShape.id)+' ('+portSnap.port.name+')', 'move');
                        } else {
                            // Fall back to dynamic outline point
                            var outlinePt = getShapeOutlinePoint(snapShape, epX, epY);
                            var rel = absToRel(snapShape, outlinePt);
                            cd[endKey] = snapShape.id;
                            if (endKey === 'from') cd.fromRel = rel;
                            else cd.toRel = rel;
                            if (es && es.isAnchor) { deleteShape(es.id); }
                            logAction('Attached '+connName(cd.id)+' '+endKey+' to '+shapeName(snapShape.id), 'move');
                        }
                    }
                }
            } else if (cd) {
                // === Body drag — also snap both anchors if close on release ===
                var snpPx2 = CONFIG.snapPx / S.zoom;
                ['from', 'to'].forEach(function(end) {
                    var es2 = findShape(cd[end]);
                    if (!es2 || !es2.isAnchor) return;
                    var snp = findNearestShape({ x: es2.x + 5, y: es2.y + 5 }, snpPx2);
                    if (snp) {
                        var epX2 = es2.x + 5, epY2 = es2.y + 5;
                        // Check for port snap first
                        var portSnap2 = nearestPort({ x: epX2, y: epY2 }, snp, 14 / S.zoom);
                        var oPt, oRel;
                        if (portSnap2) {
                            oPt = portSnap2.port;
                            oRel = absToRel(snp, oPt);
                        } else {
                            oPt = getShapeOutlinePoint(snp, epX2, epY2);
                            oRel = absToRel(snp, oPt);
                        }
                        cd[end] = snp.id;
                        if (end === 'from') cd.fromRel = oRel;
                        else cd.toRel = oRel;
                        deleteShape(es2.id);
                        logAction('Attached '+connName(cd.id)+' '+end+' to '+shapeName(snp.id), 'move');
                        console.debug('body-drag endpoint', end, 'snapped to shape', snp.id, 'rel:', oRel);
                    }
                });
            }

            S.dragConnId = null;
            S.dragConnEnd = null;
            S.dragConnAnchors = null;
            previewLayer.innerHTML = '';
            pushUndo(); render();
            container.releasePointerCapture(e.pointerId);
            return;
        }
        if (S.isSelecting) { S.isSelecting = false; previewLayer.innerHTML = ''; render(); container.releasePointerCapture(e.pointerId); return; }
        if (S.isDrawing) {
            var rawPos = toCanvas(e.clientX, e.clientY);
            var ex = snap(rawPos.x), ey = snap(rawPos.y);
            previewLayer.innerHTML = '';
            S.isDrawing = false;

            if (pendingShape) {
                // Create shape from drag dimensions (or fall through to click for tiny drags)
                var sw2 = Math.abs(ex - S.drawStart.x);
                var sh2 = Math.abs(ey - S.drawStart.y);
                if (sw2 < 5 && sh2 < 5) {
                    // Tiny drag — place a default-sized shape
                    var dShape = addShape(pendingShape.shape, snap(S.drawStart.x) - pendingShape.w/2, snap(S.drawStart.y) - pendingShape.h/2, pendingShape.w, pendingShape.h);
                    clampShape(dShape);
                    pushUndo();
                    select(dShape.id);
                    render();
                    pendingShape = null;
                    container.style.cursor = 'default';
                    updateCursor();
                    clearToolActive();
                    container.releasePointerCapture(e.pointerId);
                    return;
                }
                var x = Math.min(S.drawStart.x, ex);
                var y = Math.min(S.drawStart.y, ey);
                if (sw2 < CONFIG.minShapeSize) sw2 = CONFIG.minShapeSize;
                if (sh2 < CONFIG.minShapeSize) sh2 = CONFIG.minShapeSize;
                var shape = addShape(pendingShape.shape, x, y, sw2, sh2);
                clampShape(shape);
                pushUndo();
                select(shape.id);
                render();
                pendingShape = null;
                container.style.cursor = 'default';
                updateCursor();
                clearToolActive();
                container.releasePointerCapture(e.pointerId);
                return;
            }

            // Snap endpoints to nearby shape outlines
            var snpPx = CONFIG.snapPx / S.zoom;
            var sxSnap = S.drawStartShapeId ? findShape(S.drawStartShapeId) : findNearestShape(S.drawStart, snpPx);
            var seSnap = findNearestShape(rawPos, snpPx);
            var fromX = S.drawStart.x, fromY = S.drawStart.y;
            var toX = ex, toY = ey;
            if (sxSnap) { var p = getShapeOutlinePoint(sxSnap, toX, toY); fromX = p.x; fromY = p.y; }
            if (seSnap) { var p2 = getShapeOutlinePoint(seSnap, fromX, fromY); toX = p2.x; toY = p2.y; }
            S.drawStartShapeId = null;
            // Connect directly to shapes for snapped endpoints; use anchor circles for free ends
            var fromId, toId, fromRel = null, toRel = null;
            if (sxSnap) {
                fromId = sxSnap.id;
                fromRel = absToRel(sxSnap, { x: fromX, y: fromY });
            } else {
                var a1 = addShape('circle', fromX - 5, fromY - 5, 10, 10);
                a1.fill = 'transparent'; a1.stroke = 'transparent'; a1.sw = 0; a1.isAnchor = true;
                fromId = a1.id;
            }
            if (seSnap) {
                toId = seSnap.id;
                toRel = absToRel(seSnap, { x: toX, y: toY });
            } else {
                var a2 = addShape('circle', toX - 5, toY - 5, 10, 10);
                a2.fill = 'transparent'; a2.stroke = 'transparent'; a2.sw = 0; a2.isAnchor = true;
                toId = a2.id;
            }
            addConn(fromId, toId, false, false, fromRel, toRel);
            console.debug('line tool: committed connection', fromId, '→', toId, '| sxSnap:', !!sxSnap, 'seSnap:', !!seSnap, '| rels:', fromRel, toRel);
            pushUndo();
            render();
            container.releasePointerCapture(e.pointerId);
        }
    });

    // ===== Cleanup: pointercancel / lost capture =====
    container.addEventListener('pointercancel', cleanupPointer);
    container.addEventListener('lostpointercapture', cleanupPointer);
    function cleanupPointer(e) {
        delete S.pointers[e.pointerId];
        if (S.pinchStart && Object.keys(S.pointers).length < 2) S.pinchStart = null;
        S.isPanning = false; S.isDragging = false; S.isResizing = false;
        S.isDrawing = false; S.isDraggingConn = false; S.isSelecting = false;
        previewLayer.innerHTML = '';
        updateCursor();
        // Clean up right-click deferred pan state
        if (S._rightClickTimer) {
            clearTimeout(S._rightClickTimer);
            delete S._rightClickTimer;
        }
        delete S._rightClickStart;
        delete S._rightClickMoved;
    }

    // ===== Wheel zoom =====
    container.addEventListener('wheel', function(e) {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            // Ctrl+scroll → zoom (Google Maps behavior)
            var d = e.deltaY > 0 ? -CONFIG.zoomStep : CONFIG.zoomStep;
            var nz = clamp(S.zoom + d, CONFIG.minZoom, CONFIG.maxZoom);
            var r = container.getBoundingClientRect();
            S.panX = (e.clientX - r.left) - ((e.clientX - r.left) - S.panX) * (nz / S.zoom);
            S.panY = (e.clientY - r.top) - ((e.clientY - r.top) - S.panY) * (nz / S.zoom);
            S.zoom = nz;
            applyTransform();
        } else {
            // Plain scroll → pan (two-finger drag on trackpad)
            S.panX -= e.deltaX;
            S.panY -= e.deltaY;
            applyTransform();
        }
    }, { passive: false });

    // ===== Context menu =====
    /** Show the app's context menu at the given screen coordinates.
     *  Hit-tests shapes (topmost first) and connections to determine
     *  what the menu applies to. */
    function showContextMenuAt(x, y) {
        if (S.readOnly) return;
        var shapeEls = [].slice.call(shapesLayer.querySelectorAll('.diagram-shape')).reverse();
        var found = false;
        for (var i = 0; i < shapeEls.length; i++) {
            var el = shapeEls[i];
            var s = findShape(el.dataset.id);
            if (!s) continue;
            var r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
                if (!S.selection.includes(s.id)) select(s.id);
                contextMenu.style.left = x + 'px';
                contextMenu.style.top = y + 'px';
                contextMenu.classList.remove('hidden');
                found = true; break;
            }
        }
        if (!found) {
            var pos = toCanvas(x, y);
            var conn = findConnAt(pos);
            if (conn) {
                if (!S.selection.includes(conn.id)) select(conn.id);
                contextMenu.style.left = x + 'px';
                contextMenu.style.top = y + 'px';
                contextMenu.classList.remove('hidden');
            }
        }
    }

    container.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        // Keyboard (Shift+F10 / Menu key) — show menu at current position
        if (!e.pointerType) {
            showContextMenuAt(e.clientX, e.clientY);
            return;
        }
        // Mouse / touch — menu already shown in pointerdown, suppress native
    });

    document.addEventListener('click', function(e) {
        if (!contextMenu.contains(e.target)) contextMenu.classList.add('hidden');
    });

    // ===== Text input =====
    textInput.addEventListener('blur', function() {
        if (!textEditor.classList.contains('visible')) return;  // already committed by pointerdown
        var sIds = shapeSel();
        if (sIds.length === 1) {
            var s = findShape(sIds[0]);
            if (s) { s.text = textInput.value; pushUndo(); logAction('Text: "'+textInput.value+'"', 'edit'); render(); }
        }
        textEditor.classList.remove('visible');
    });
    textInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { textInput.blur(); }
        // Enter submits, Shift+Enter inserts newline (default textarea behavior)
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textInput.blur(); }
    });

    // ===== Toolbar tool buttons =====
    function clearToolActive() {
        document.querySelectorAll('.tool-btn').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.shape-btn').forEach(function(b) { b.classList.remove('active'); });
    }

    document.querySelectorAll('[data-tool]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            S.tool = btn.dataset.tool;
            pendingShape = null;
            clearToolActive();
            btn.classList.add('active');
            updateCursor();
            logAction('Tool: '+S.tool, 'sys');
        });
    });

    // ===== Shape buttons =====
    var pendingShape = null;
    document.querySelectorAll('.shape-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            pendingShape = {
                shape: btn.dataset.shape,
                w: parseInt(btn.dataset.width) || 100,
                h: parseInt(btn.dataset.height) || 80
            };
            container.style.cursor = 'crosshair';
            clearToolActive();
            btn.classList.add('active');
        });
    });

    // Click on canvas to place pending shape
    container.addEventListener('click', function(e) {
        if (!pendingShape || S.isDragging || S.isResizing || S.isDraggingConn) return;
        var pos = toCanvas(e.clientX, e.clientY);
        var shape = addShape(pendingShape.shape, snap(pos.x) - pendingShape.w/2, snap(pos.y) - pendingShape.h/2, pendingShape.w, pendingShape.h);
        clampShape(shape);
        pushUndo();
        select(shape.id);
        render();
        pendingShape = null;
        container.style.cursor = 'default';
        updateCursor();
        clearToolActive();
    });

    // ===== Toolbar action buttons =====
    document.getElementById('btn-undo').addEventListener('click', undo);
    document.getElementById('btn-redo').addEventListener('click', redo);
    document.getElementById('btn-duplicate').addEventListener('click', function() {
        shapeSel().forEach(function(id) { dup(id); });
        pushUndo(); render();
    });
    document.getElementById('btn-delete').addEventListener('click', function() {
        shapeSel().forEach(function(id) { deleteShape(id); });
        connSel().forEach(function(id) { deleteConn(id); });
        S.selection = [];
        pushUndo(); render();
    });
    document.getElementById('btn-grid').addEventListener('click', function() {
        S.showGrid = !S.showGrid;
        this.classList.toggle('active', S.showGrid);
        logAction('Grid: '+(S.showGrid?'on':'off'), 'sys');
        renderGrid();
    });
    document.getElementById('btn-snap').addEventListener('click', function() {
        S.snapToGrid = !S.snapToGrid;
        this.classList.toggle('active', S.snapToGrid);
        logAction('Snap: '+(S.snapToGrid?'on':'off'), 'sys');
    });
    document.getElementById('btn-zoom-in').addEventListener('click', function() {
        S.zoom = clamp(S.zoom + CONFIG.zoomStep, CONFIG.minZoom, CONFIG.maxZoom);
        logAction('Zoom: '+Math.round(S.zoom*100)+'%', 'sys');
        applyTransform();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', function() {
        S.zoom = clamp(S.zoom - CONFIG.zoomStep, CONFIG.minZoom, CONFIG.maxZoom);
        logAction('Zoom: '+Math.round(S.zoom*100)+'%', 'sys');
        applyTransform();
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', function() {
        var html = document.documentElement;
        var isDark = html.dataset.theme !== 'light';
        html.dataset.theme = isDark ? 'light' : 'dark';
        // Toggle SVG icons
        var sun = this.querySelector('.theme-sun');
        var moon = this.querySelector('.theme-moon');
        if (sun) sun.style.display = isDark ? 'block' : 'none';
        if (moon) moon.style.display = isDark ? 'none' : 'block';
        localStorage.setItem('diagram-theme', isDark ? 'light' : 'dark');
        readTheme();
        renderGrid();
        renderConns();
        logAction('Theme: ' + (isDark ? 'light' : 'dark'), 'sys');
    });

    // Panel collapse toggle
    function togglePanel() {
        var collapsed = propsPanel.classList.toggle('collapsed');
        var svg = btnCollapse.querySelector('svg');
        if (collapsed) {
            btnCollapse.title = 'Expand panel (Ctrl+\\)';
            if (svg) svg.style.transform = 'scaleX(-1)';
            // Clear any saved inline width so CSS width:40px takes effect
            propsPanel.style.width = '';
        } else {
            btnCollapse.title = 'Collapse panel (Ctrl+\\)';
            if (svg) svg.style.transform = '';
            // Restore saved width on expand
            var savedW = localStorage.getItem('diagram-panel-width');
            if (savedW) {
                var w = parseInt(savedW, 10);
                if (w >= 120 && w <= 600) propsPanel.style.width = w + 'px';
            }
        }
        localStorage.setItem('diagram-panel-collapsed', collapsed ? '1' : '0');
    }
    btnCollapse.addEventListener('click', function(e) {
        e.stopPropagation();
        togglePanel();
    });
    // Click the collapsed header strip to expand
    document.querySelector('.panel-header').addEventListener('click', function(e) {
        if (propsPanel.classList.contains('collapsed') && e.target !== btnCollapse) {
            togglePanel();
        }
    });

    // ===== Panel Resize Handle =====
    var panelResizeHandle = document.getElementById('panel-resize-handle');
    if (panelResizeHandle) {
        panelResizeHandle.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            panelResizeHandle.setPointerCapture(e.pointerId);
            panelResizeHandle.classList.add('active');
            panelResizeHandle._startW = propsPanel.offsetWidth;
            panelResizeHandle._startX = e.clientX;
        });
        document.addEventListener('pointermove', function(e) {
            if (!panelResizeHandle.classList.contains('active')) return;
            var dx = panelResizeHandle._startX - e.clientX;
            var newW = Math.max(120, Math.min(600, panelResizeHandle._startW + dx));
            propsPanel.style.width = newW + 'px';
        });
        document.addEventListener('pointerup', function(e) {
            if (!panelResizeHandle.classList.contains('active')) return;
            panelResizeHandle.classList.remove('active');
            // Save width to localStorage
            try { localStorage.setItem('diagram-panel-width', String(propsPanel.offsetWidth)); } catch (e) {}
        });
    }

    document.getElementById('log-toggle').addEventListener('click', function() {
        var panel = document.querySelector('.panel-log');
        var open = panel.classList.toggle('open');
        var svg = this.querySelector('svg');
        if (svg) svg.style.transform = open ? 'rotate(180deg)' : '';
    });

    // ===== Toolbar style controls (apply to selected shapes) =====
    fillInput.addEventListener('input', function()      { applyStyleToSelected('fill', fillInput.value); });
    fillInput.addEventListener('change', function()      { scheduleSave(); });
    strokeInput.addEventListener('input', function()    { applyStyleToSelected('stroke', strokeInput.value); });
    strokeInput.addEventListener('change', function()    { scheduleSave(); });
    swInput.addEventListener('input', function()        { applyStyleToSelected('sw', parseInt(swInput.value) || 0); });
    swInput.addEventListener('change', function()        { scheduleSave(); });
    opacityInput.addEventListener('input', function()   { applyStyleToSelected('opacity', parseInt(opacityInput.value) / 100); });
    opacityInput.addEventListener('change', function()   { scheduleSave(); });
    textColorInput.addEventListener('input', function() { applyStyleToSelected('textColor', textColorInput.value); });
    textColorInput.addEventListener('change', function() { scheduleSave(); });

    // ===== Props panel style controls (two-way sync with toolbar) =====
    propFill.addEventListener('input', function() {
        applyStyleToSelected('fill', propFill.value);
        fillInput.value = propFill.value;
    });
    propFill.addEventListener('change', function() { scheduleSave(); });
    propStroke.addEventListener('input', function() {
        applyStyleToSelected('stroke', propStroke.value);
        strokeInput.value = propStroke.value;
    });
    propStroke.addEventListener('change', function() { scheduleSave(); });
    propSw.addEventListener('input', function() {
        applyStyleToSelected('sw', parseInt(propSw.value) || 0);
        swInput.value = propSw.value;
    });
    propSw.addEventListener('change', function() { scheduleSave(); });
    propOpacity.addEventListener('input', function() {
        applyStyleToSelected('opacity', parseInt(propOpacity.value) / 100);
        opacityInput.value = propOpacity.value;
    });
    propOpacity.addEventListener('change', function() { scheduleSave(); });

    if (propFillOpacity) {
        propFillOpacity.addEventListener('input', function() {
            applyStyleToSelected('fillOpacity', parseInt(propFillOpacity.value) / 100);
        });
        propFillOpacity.addEventListener('change', function() { scheduleSave(); render(); });
    }
    if (propStrokeOpacity) {
        propStrokeOpacity.addEventListener('input', function() {
            applyStyleToSelected('strokeOpacity', parseInt(propStrokeOpacity.value) / 100);
        });
        propStrokeOpacity.addEventListener('change', function() { scheduleSave(); render(); });
    }

    propTextColor.addEventListener('input', function() {
        applyStyleToSelected('textColor', propTextColor.value);
        textColorInput.value = propTextColor.value;
    });
    propTextColor.addEventListener('change', function() { scheduleSave(); });
    propFontSize.addEventListener('input', function() {
        var v = parseInt(propFontSize.value) || CONFIG.defaultFontSize;
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s.fontSize = v;
        });
        logAction('Font size → '+v, 'edit');
        render();
    });
    propFontSize.addEventListener('change', function() { scheduleSave(); });

    // Text alignment
    propTextAlign.addEventListener('change', function() {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s.textAlign = propTextAlign.value;
        });
        logAction('Text align → '+propTextAlign.value, 'edit');
        scheduleSave();
        render();
    });

    // Text padding
    propTextPad.addEventListener('input', function() {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s.textPad = parseInt(propTextPad.value) || 0;
        });
        render();
    });
    propTextPad.addEventListener('change', function() { scheduleSave(); });

    // Custom SVG code
    customSvgCode.addEventListener('input', function() {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s && s.type === 'custom') {
                s.customSvg = customSvgCode.value;
                // Try to read viewBox from a pasted <svg> tag so customW/customH match
                var m = customSvgCode.value.match(/<svg\b[^>]*>/i);
                if (m) {
                    var vb = m[0].match(/viewBox\s*=\s*["']([^"']*)["']/i);
                    if (vb) {
                        var parts = vb[1].split(/[\s,]+/);
                        if (parts.length >= 4) {
                            var pw = parseFloat(parts[2]), ph = parseFloat(parts[3]);
                            if (pw > 0 && ph > 0) { s.customW = pw; s.customH = ph; }
                        }
                    }
                }
                // Fallback: for bare SVG elements (no outer <svg> tag), default to 100×100.
                // Shapes typically use a 0-100 coord space; users can adjust via ViewBox fields.
                if (!m) {
                    if (!s.customW) s.customW = 100;
                    if (!s.customH) s.customH = 100;
                } else if (!s.customW || !s.customH) {
                    if (!s.customW) s.customW = s.width;
                    if (!s.customH) s.customH = s.height;
                }
            }
        });
        render();
    });
    customSvgCode.addEventListener('change', function() { scheduleSave(); });

    // Custom viewBox width/height
    customVbW.addEventListener('input', function() {
        var v = parseInt(customVbW.value) || 0;
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s && s.type === 'custom') { s.customW = v; }
        });
        render();
    });
    customVbW.addEventListener('change', function() { scheduleSave(); });
    customVbH.addEventListener('input', function() {
        var v = parseInt(customVbH.value) || 0;
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s && s.type === 'custom') { s.customH = v; }
        });
        render();
    });
    customVbH.addEventListener('change', function() { scheduleSave(); });

    // Shape name
    propNameInput.addEventListener('change', function() {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            var oldName = s ? s.name : '';
            if (s) s.name = propNameInput.value.trim() || oldName;
            if (s) logAction('Renamed '+oldName+' → '+s.name, 'edit');
        });
        scheduleSave();
        render();
    });

    // Z-height
    propZHeight.addEventListener('change', function() {
        var v = parseInt(propZHeight.value) || 0;
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s.zHeight = v;
        });
        logAction('Z-height → '+v, 'edit');
        scheduleSave();
        render();
    });

    // ===== Layouts panel (delegated events) =====
    document.addEventListener('click', function(e) {
        var toggle = e.target.closest('.layer-vis-toggle');
        if (toggle) {
            var id = toggle.dataset.id;
            var s = findShape(id);
            if (s) {
                s.hidden = !s.hidden;
                logAction((s.hidden ? 'Hid' : 'Showed')+' '+s.name, 'edit');
                scheduleSave();
                render();
            }
        }
    });
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('layer-z')) {
            var id = e.target.dataset.id;
            var v = parseInt(e.target.value) || 0;
            var s = findShape(id);
            if (s) {
                s.zHeight = v;
                // Also reflect in properties panel if this shape is selected
                if (propZHeight) propZHeight.value = v;
                logAction('Z-height → '+v+' ('+s.name+')', 'edit');
                scheduleSave();
                render();
            }
        }
    });

    // ===== Tab switching (Properties / Layers) =====
    document.addEventListener('click', function(e) {
        var tab = e.target.closest('.panel-tab');
        if (!tab) return;
        var target = tab.dataset.tab;
        // Update active tab
        document.querySelectorAll('.panel-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        // Show/hide content
        var scroll = document.querySelector('.panel-scroll');
        var layers = document.getElementById('panel-layers');
        if (scroll) scroll.style.display = target === 'properties' ? '' : 'none';
        if (layers) layers.style.display = target === 'layers' ? '' : 'none';
        // Render layers content if opening tab
        if (target === 'layers') renderLayouts();
    });

    // ===== Props panel geometry/text =====
    [propX, propY, propWidth, propHeight].forEach(function(input) {
        input.addEventListener('change', function() {
            var v = parseFloat(input.value);
            var prop = input.id.replace('prop-', '');
            shapeSel().forEach(function(sid) {
                var s = findShape(sid);
                if (s) s[prop] = v;
            });
            pushUndo();
            logAction('Changed '+prop+' of '+shapeSel().map(shapeName).join(', '), 'edit');
            render();
        });
    });
    propText.addEventListener('change', function() {
        shapeSel().forEach(function(sid) {
            var s = findShape(sid);
            if (s) s.text = propText.value;
        });
        pushUndo();
        logAction('Edited text of '+shapeSel().map(shapeName).join(', '), 'edit');
        render();
    });

    // ===== Connection panel controls =====
    connColor.addEventListener('input', function() {
        connSel().forEach(function(cid) {
            var c = findConn(cid);
            if (c) c.stroke = connColor.value;
        });
        render();
    });
    connColor.addEventListener('change', function() {
        logAction('Conn color → '+connColor.value, 'edit');
        scheduleSave();
    });
    connWidth.addEventListener('input', function() {
        var v = parseInt(connWidth.value) || 1;
        connSel().forEach(function(cid) {
            var c = findConn(cid);
            if (c) c.sw = v;
        });
        render();
    });
    connWidth.addEventListener('change', function() {
        logAction('Conn width → '+connWidth.value, 'edit');
        scheduleSave();
    });
    connArrowStart.addEventListener('change', function() {
        connSel().forEach(function(cid) {
            var c = findConn(cid);
            if (c) c.arrowStart = connArrowStart.checked;
        });
        logAction('Arrow start: '+connArrowStart.checked, 'edit');
        scheduleSave();
        render();
    });
    connArrowEnd.addEventListener('change', function() {
        connSel().forEach(function(cid) {
            var c = findConn(cid);
            if (c) c.arrowEnd = connArrowEnd.checked;
        });
        logAction('Arrow end: '+connArrowEnd.checked, 'edit');
        scheduleSave();
        render();
    });

    // Connection name
    connNameInput.addEventListener('change', function() {
        connSel().forEach(function(cid) {
            var c = findConn(cid);
            var oldName = c ? c.name : '';
            if (c) c.name = connNameInput.value.trim() || oldName;
            if (c) logAction('Renamed '+oldName+' → '+c.name, 'edit');
        });
        scheduleSave();
        render();
    });

    // Canvas size
    // Canvas size
    // Canvas size (project panel)
    canvasWidth.addEventListener('change', function() {
        var v = clamp(parseInt(canvasWidth.value) || 3000, 500, CONFIG.maxCanvasW);
        S.canvasW = v; canvasWidth.value = v;
        scheduleSave(); renderGrid();
    });
    canvasHeight.addEventListener('change', function() {
        var v = clamp(parseInt(canvasHeight.value) || 2000, 500, CONFIG.maxCanvasH);
        S.canvasH = v; canvasHeight.value = v;
        scheduleSave(); renderGrid();
    });

    // Project name
    projectNameInput.addEventListener('change', function() {
        S.projectName = projectNameInput.value.trim() || 'Untitled';
        projectNameInput.value = S.projectName;
        scheduleSave();
    });

    // Export dropdown
    btnExport.addEventListener('click', function(e) {
        e.stopPropagation();
        var br = btnExport.getBoundingClientRect();
        exportDrop.style.left = Math.max(4, br.left + br.width - 200) + 'px';
        exportDrop.style.top = (br.bottom) + 'px';
        exportDrop.classList.toggle('visible');
    });
    document.addEventListener('click', function(e) {
        if (!exportDrop.contains(e.target) && e.target !== btnExport) {
            exportDrop.classList.remove('visible');
        }
    });
    exportDrop.querySelectorAll('.export-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            exportDrop.classList.remove('visible');
            var act = item.dataset.action;
            var parts = act.split('-');
            var format = parts[1];
            var autoCrop = parts[2] === 'auto';
            doExport(format, autoCrop);
        });
    });

    // New Canvas
    btnNew.addEventListener('click', function() {
        if (S.shapes.length > 0 || S.connections.length > 0) {
            if (!confirm('Start a new canvas? Any unsaved changes will be lost.')) return;
        }
        S.shapes = [];
        S.connections = [];
        S.selection = [];
        S.nextId = 1;
        S.nameCounters = {};
        S.connNameCounter = 0;
        S.projectName = '';
        S.undoStack = [];
        S.redoStack = [];
        S.zoom = 1;
        S.canvasW = 800;
        S.canvasH = 600;
        S.metadata = { version: VERSION, createdAt: null, updatedAt: null, savedAt: null };
        var r = container.getBoundingClientRect();
        S.panX = r.width / 2 - 400;
        S.panY = 50;
        saveState();
        render();
        logAction('New canvas created', 'sys');
    });

    // Save — triggers auto-save picker first time, falls back to download
    btnSaveFile.addEventListener('click', function() {
        // If auto-save is already active, just do a manual download as backup
        if (S.autoSaveFileHandle) {
            downloadSaveFile();
            return;
        }
        // If File System Access API is available, open picker and start auto-saving
        if (fsApiSupported()) {
            startAutoSave();
        } else {
            downloadSaveFile();
        }
    });

    function downloadSaveFile() {
        var data = {
            shapes: S.shapes, connections: S.connections, nextId: S.nextId,
            nameCounters: S.nameCounters, connNameCounter: S.connNameCounter,
            zoom: S.zoom, panX: S.panX, panY: S.panY,
            canvasW: S.canvasW, canvasH: S.canvasH,
            projectName: S.projectName,
            metadata: (function() { updateMetadata(); return S.metadata; })()
        };
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.download = (S.projectName || 'diagram').replace(/[^a-z0-9_-]/gi,'_') + '.json';
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
        logAction('Downloaded project file', 'sys');
    }

    function startAutoSave() {
        var opts = {
            suggestedName: (S.projectName || 'diagram').replace(/[^a-z0-9_-]/gi, '_') + '.json',
            types: [{ description: 'JSON Diagram', accept: { 'application/json': ['.json'] } }]
        };
        window.showSaveFilePicker(opts).then(function(handle) {
            S.autoSaveFileHandle = handle;
            storeFileHandle(handle);
            updateAutoSaveUI();
            writeToAutoSaveFile();
            logAction('Auto-save enabled: ' + handle.name, 'sys');
        }).catch(function(err) {
            if (err.name !== 'AbortError') {
                console.error('Auto-save picker failed:', err);
            }
        });
    }
    btnLoadFile.addEventListener('click', function() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = function() {
            var file = input.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(e) {
                try {
                    var d = JSON.parse(e.target.result);
                    S.shapes = d.shapes || [];
                    S.connections = d.connections || [];
                    S.nameCounters = d.nameCounters || {};
                    S.connNameCounter = d.connNameCounter || 0;
                    S.nextId = (d.nextId || 0) + 1;
                    if (typeof d.canvasW === 'number') S.canvasW = d.canvasW;
                    if (typeof d.canvasH === 'number') S.canvasH = d.canvasH;
                    S.projectName = d.projectName || 'Untitled';
                    if (typeof d.zoom === 'number') S.zoom = d.zoom;
                    if (typeof d.panX === 'number') S.panX = d.panX;
                    if (typeof d.panY === 'number') S.panY = d.panY;
                    // Restore metadata if present, else reset
                    if (d.metadata) {
                        S.metadata = {
                            version: d.metadata.version || VERSION,
                            createdAt: d.metadata.createdAt || null,
                            updatedAt: d.metadata.updatedAt || null,
                            savedAt: d.metadata.savedAt || null
                        };
                    } else {
                        S.metadata = { version: VERSION, createdAt: null, updatedAt: null, savedAt: null };
                    }
                    S.selection = [];
                    S.undoStack = []; S.redoStack = [];
                    saveState(); renderGrid(); render(); applyTransform();
                    var metaInfo = S.metadata.version ? ' (v' + S.metadata.version + ')' : '';
                    logAction('Loaded project' + metaInfo + ': ' + S.projectName, 'sys');
                } catch(err) {
                    console.error('Load failed:', err);
                    logAction('Load failed: invalid file', 'sys');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    });

    // ===== Context menu actions =====
    contextMenu.querySelectorAll('.context-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var act = item.dataset.action;
            var sIds = shapeSel(), cIds = connSel();
            if (sIds.length > 0) {
                switch (act) {
                    case 'copy':         copySelection(); break;
                    case 'paste':         pasteClipboard(); break;
                    case 'duplicate':    sIds.forEach(function(id) { dup(id); }); break;
                    case 'delete':       sIds.forEach(function(id) { deleteShape(id); }); break;
                    case 'bring-front':   sIds.forEach(function(id) { toFront(id); }); break;
                    case 'bring-forward': sIds.forEach(function(id) { forward(id); }); break;
                    case 'send-backward': sIds.forEach(function(id) { backward(id); }); break;
                    case 'send-back':     sIds.forEach(function(id) { toBack(id); }); break;
                    case 'lock':
                        sIds.forEach(function(id) {
                            var s = findShape(id);
                            if (s) { s.locked = !s.locked; logAction((s.locked?'Locked':'Unlocked')+' '+s.name, 'edit'); }
                        });
                        break;
                    case 'edit-text':
                        if (sIds.length === 1) { startTextEdit(sIds[0]); contextMenu.classList.add('hidden'); return; }
                        break;
                }
            } else if (cIds.length > 0) {
                if (act === 'delete') { cIds.forEach(function(id) { deleteConn(id); }); }
            }
            contextMenu.classList.add('hidden');
            pushUndo();
            render();
        });
    });

    // ===== Keyboard =====
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        // Read-only mode: block all mutations (Esc and zoom still work)
        var isMutationKey = (e.key === 'Delete' || e.key === 'Backspace' ||
            (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || e.key === 'c' || e.key === 'v' || e.key === 'd' || e.key === ']' || e.key === '['));
        if (S.readOnly && isMutationKey) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
            shapeSel().forEach(function(id) { deleteShape(id); });
            connSel().forEach(function(id) { deleteConn(id); });
            S.selection = [];
            pushUndo();
            render();
            e.preventDefault();
        }
        if (e.key === 'Escape') {
            deselectAll();
            S.tool = 'select';
            S.drawStartShapeId = null;
            pendingShape = null;
            clearToolActive();
            document.querySelector('[data-tool="select"]').classList.add('active');
            updateCursor();
        }

        var keys = { v:'select', l:'line', t:'text' };
        if (keys[e.key] && !e.ctrlKey && !e.metaKey) {
            S.tool = keys[e.key];
            pendingShape = null;
            clearToolActive();
            document.querySelector('[data-tool="'+keys[e.key]+'"]').classList.add('active');
            updateCursor();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); pasteClipboard(); pushUndo(); render(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); shapeSel().forEach(function(id) { dup(id); }); pushUndo(); render(); }
        if ((e.ctrlKey || e.metaKey) && e.key === ']') { e.preventDefault(); shapeSel().forEach(function(id) { forward(id); }); pushUndo(); render(); }
        if ((e.ctrlKey || e.metaKey) && e.key === '[') { e.preventDefault(); shapeSel().forEach(function(id) { backward(id); }); pushUndo(); render(); }
        if (e.key === 'g') { S.showGrid = !S.showGrid; document.getElementById('btn-grid').classList.toggle('active', S.showGrid); logAction('Grid: '+(S.showGrid?'on':'off'), 'sys'); renderGrid(); }
        if ((e.key === 's') && !e.ctrlKey && !e.metaKey) { S.snapToGrid = !S.snapToGrid; document.getElementById('btn-snap').classList.toggle('active', S.snapToGrid); logAction('Snap: '+(S.snapToGrid?'on':'off'), 'sys'); }
        if (e.key === '+' || e.key === '=') { S.zoom = clamp(S.zoom + CONFIG.zoomStep, CONFIG.minZoom, CONFIG.maxZoom); logAction('Zoom: '+Math.round(S.zoom*100)+'%', 'sys'); applyTransform(); }
        if (e.key === '-') { S.zoom = clamp(S.zoom - CONFIG.zoomStep, CONFIG.minZoom, CONFIG.maxZoom); logAction('Zoom: '+Math.round(S.zoom*100)+'%', 'sys'); applyTransform(); }
        if (e.key === 'Enter' && shapeSel().length === 1 && !textEditor.classList.contains('visible')) startTextEdit(shapeSel()[0]);
        if ((e.ctrlKey || e.metaKey) && e.key === '\\') { e.preventDefault(); togglePanel(); }
    });

    // ===== Init =====
    function init() {

        // Migrate old localStorage keys (diagramflow-* → diagram-*)
        var oldTheme = localStorage.getItem('diagramflow-theme');
        if (oldTheme && !localStorage.getItem('diagram-theme')) {
            localStorage.setItem('diagram-theme', oldTheme);
            localStorage.removeItem('diagramflow-theme');
        }
        var oldState = localStorage.getItem('diagramflow-state');
        if (oldState && !localStorage.getItem('diagram-state')) {
            localStorage.setItem('diagram-state', oldState);
            localStorage.removeItem('diagramflow-state');
        }

        // Load theme
        var savedTheme = localStorage.getItem('diagram-theme') || 'dark';
        document.documentElement.dataset.theme = savedTheme;
        // Set theme toggle SVG visibility
        (function() {
            var toggle = document.getElementById('theme-toggle');
            if (!toggle) return;
            var sun = toggle.querySelector('.theme-sun');
            var moon = toggle.querySelector('.theme-moon');
            if (sun) sun.style.display = savedTheme === 'light' ? 'none' : 'block';
            if (moon) moon.style.display = savedTheme === 'light' ? 'block' : 'none';
        })();
        readTheme();

        // Set up BroadcastChannel for multi-tab coordination
        setupBroadcastChannel();

        // Try to restore File System Access auto-save handle
        restoreAutoSaveHandle();
        updateAutoSaveUI();

        // Cross-tab theme sync (F8)
        window.addEventListener('storage', function(e) {
            if (e.key === 'diagram-theme' && e.newValue) {
                document.documentElement.dataset.theme = e.newValue;
                var toggle = document.getElementById('theme-toggle');
                if (toggle) {
                    var sun = toggle.querySelector('.theme-sun');
                    var moon = toggle.querySelector('.theme-moon');
                    if (sun) sun.style.display = e.newValue === 'light' ? 'none' : 'block';
                    if (moon) moon.style.display = e.newValue === 'light' ? 'block' : 'none';
                }
                readTheme();
                renderGrid();
                renderConns();
            }
        });

        // Restore panel collapsed state
        if (localStorage.getItem('diagram-panel-collapsed') === '1') {
            propsPanel.classList.add('collapsed');
            btnCollapse.title = 'Expand panel (Ctrl+\\)';
            var collapseSvg = btnCollapse.querySelector('svg');
            if (collapseSvg) collapseSvg.style.transform = 'scaleX(-1)';
        }
        // Restore panel width (skip if collapsed so CSS width:40px wins)
        if (!propsPanel.classList.contains('collapsed')) {
            var savedW = localStorage.getItem('diagram-panel-width');
            if (savedW) {
                var w = parseInt(savedW, 10);
                if (w >= 120 && w <= 600) propsPanel.style.width = w + 'px';
            }
        }

        var saved = localStorage.getItem('diagram-state');
        if (saved) {
            try {
                var d = JSON.parse(saved);
                S.shapes = d.shapes || []; S.connections = d.connections || [];
                S.nameCounters = d.nameCounters || {};
                S.connNameCounter = d.connNameCounter || 0;
                S.nextId = (d.nextId || 0) + 1;
                if (typeof d.zoom === 'number' && d.zoom >= CONFIG.minZoom && d.zoom <= CONFIG.maxZoom) S.zoom = d.zoom;
                if (typeof d.panX === 'number') S.panX = d.panX;
                if (typeof d.panY === 'number') S.panY = d.panY;
                if (typeof d.canvasW === 'number') S.canvasW = d.canvasW;
                if (typeof d.canvasH === 'number') S.canvasH = d.canvasH;
                if (typeof d.projectName === 'string') S.projectName = d.projectName;
                // Restore metadata if present, else reset for localStorage
                if (d.metadata) {
                    S.metadata = {
                        version: d.metadata.version || VERSION,
                        createdAt: d.metadata.createdAt || null,
                        updatedAt: d.metadata.updatedAt || null,
                        savedAt: d.metadata.savedAt || null
                    };
                } else {
                    S.metadata = { version: VERSION, createdAt: null, updatedAt: null, savedAt: null };
                }

                S.shapes.forEach(function(s) {
                    if (!s || typeof s !== 'object') return;
                    if (!s.textAlign) s.textAlign = 'center';
                    if (!s.name) {
                        var t = s.type || 'shape';
                        if (!S.nameCounters[t]) S.nameCounters[t] = 0;
                        S.nameCounters[t]++;
                        s.name = t.charAt(0).toUpperCase() + t.slice(1) + ' ' + S.nameCounters[t];
                    }
                });
                S.connections.forEach(function(c) {
                    if (!c || typeof c !== 'object') return;
                    if (!c.name) { S.connNameCounter++; c.name = 'Line ' + S.connNameCounter; }
                });

                logAction('Loaded '+S.shapes.length+' shapes, '+S.connections.length+' connections', 'sys');
            } catch(e) {
                console.error('Failed to load saved state:', e);
                saved = null;
            }
        }
        if (!saved) {
            logAction('Creating demo diagram (no saved state found)', 'sys');
            var demos = [
                { type:'terminator', x:400, y:80,  w:160, h:60,  text:'Start',     fill:'#DBEAFE', stroke:'#2563EB' },
                { type:'rect',       x:370, y:220, w:220, h:70,  text:'Process',   fill:'#DCFCE7', stroke:'#16A34A' },
                { type:'diamond',    x:410, y:380, w:140, h:140, text:'Decision?', fill:'#FEF3C7', stroke:'#D97706' },
                { type:'rect',       x:200, y:590, w:160, h:60,  text:'Path A',    fill:'#FEE2E2', stroke:'#DC2626' },
                { type:'roundRect',  x:600, y:590, w:160, h:60,  text:'Path B',    fill:'#DBEAFE', stroke:'#2563EB' },
                { type:'terminator', x:400, y:720, w:160, h:60,  text:'End',       fill:'#DCFCE7', stroke:'#16A34A' }
            ];
            demos.forEach(function(ds) {
                var s = addShape(ds.type, ds.x, ds.y, ds.w, ds.h);
                s.text = ds.text; s.fill = ds.fill; s.stroke = ds.stroke;
            });
            var ids = S.shapes.map(function(s) { return s.id; });
            // Connect shapes directly — then lock attachment points with relative offsets
            addConn(ids[0], ids[1], false, true); addConn(ids[1], ids[2], false, true);
            addConn(ids[2], ids[3], false, true); addConn(ids[2], ids[4], false, true);
            addConn(ids[3], ids[5], false, true); addConn(ids[4], ids[5], false, true);

            // Backfill relative offsets so connections stick to one point on the outline
            S.connections.forEach(function(c) {
                var ep = connEndpoints(c);
                if (!ep) return;
                var fa = findShape(c.from), fb = findShape(c.to);
                if (fa && !fa.isAnchor) c.fromRel = absToRel(fa, { x: ep.x1, y: ep.y1 });
                if (fb && !fb.isAnchor) c.toRel   = absToRel(fb, { x: ep.x2, y: ep.y2 });
            });
            // Immediately persist the demo state so it survives refresh
            saveState();
        }

        // Seed toolbar inputs
        fillInput.value = '#ffffff'; strokeInput.value = '#333333';
        swInput.value = '2'; opacityInput.value = '100'; textColorInput.value = '#111113';
        propFill.value = '#ffffff'; propStroke.value = '#333333';
        propSw.value = '2'; propOpacity.value = '100'; if (propFillOpacity) propFillOpacity.value = '100'; if (propStrokeOpacity) propStrokeOpacity.value = '100'; propTextColor.value = '#111113';
        propFontSize.value = CONFIG.defaultFontSize;
        connColor.value = '#94A3B8'; connWidth.value = '2'; connArrowStart.checked = false; connArrowEnd.checked = true;

        renderGrid(); applyTransform(); updateCursor(); render();
        canvasWidth.value = S.canvasW; canvasHeight.value = S.canvasH;
        // Only reset viewport if no saved state was found (demo data first launch)
        if (!saved) {
            var r = container.getBoundingClientRect();
            S.panX = r.width/2 - 500; S.panY = 50;
            applyTransform();
        }
    }

    init();

    window.addEventListener('beforeunload', function() { saveState(); releaseChannel(); });
    window.addEventListener('pagehide', function() { saveState(); releaseChannel(); });
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') saveState();
    });

})();