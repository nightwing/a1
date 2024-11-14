function MutationRecord(type, target) {
    this.type = type;
    this.target = target;
    this.addedNodes = [];
    this.removedNodes = [];
    this.previousSibling = null;
    this.nextSibling = null;
    this.attributeName = null;
    this.attributeNamespace = null;
    this.oldValue = null;
}

function MutationObserver(callback) {
    this.callback = callback;
    this.observing = new Map();
    this.pendingMutations = [];
    this.timeout = null;
}

(function() {
    this.observe = function(target, config) {
        if (!target || !config) 
            throw new TypeError("Failed to execute 'observe': 2 arguments required");

        config = {
            attributes: !!config.attributes,
            childList: !!config.childList,
            subtree: !!config.subtree,
            attributeOldValue: !!config.attributeOldValue,
            characterDataOldValue: !!config.characterDataOldValue,
            attributeFilter: Array.isArray(config.attributeFilter) ? config.attributeFilter : undefined
        };

        this.observing.set(target, config);
        
        // Patch the target's methods to trigger mutations
        if (config.childList) {
            const original = {
                appendChild: target.appendChild,
                removeChild: target.removeChild,
                insertBefore: target.insertBefore
            };

            target.appendChild = (node) => {
                const result = original.appendChild.call(target, node);
                this._queueMutation('childList', target, { addedNodes: [node] });
                return result;
            };

            target.removeChild = (node) => {
                const result = original.removeChild.call(target, node);
                this._queueMutation('childList', target, { removedNodes: [node] });
                return result;
            };

            target.insertBefore = (node, ref) => {
                const result = original.insertBefore.call(target, node, ref);
                this._queueMutation('childList', target, { addedNodes: [node] });
                return result;
            };
        }

        if (config.attributes) {
            const originalSetAttribute = target.setAttribute;
            target.setAttribute = (name, value) => {
                const oldValue = target.getAttribute(name);
                const result = originalSetAttribute.call(target, name, value);
                this._queueMutation('attributes', target, { 
                    attributeName: name,
                    oldValue: config.attributeOldValue ? oldValue : null
                });
                return result;
            };
        }
    };

    this.disconnect = function() {
        this.observing.clear();
        this.pendingMutations = [];
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
    };

    this.takeRecords = function() {
        const records = this.pendingMutations;
        this.pendingMutations = [];
        return records;
    };

    // Private method to queue mutations
    this._queueMutation = function(type, target, options = {}) {
        const record = new MutationRecord(type, target);
        Object.assign(record, options);
        this.pendingMutations.push(record);

        // Debounce the callback to batch mutations
        if (!this.timeout) {
            this.timeout = setTimeout(() => {
                const records = this.takeRecords();
                if (records.length > 0) {
                    this.callback(records, this);
                }
                this.timeout = null;
            }, 0);
        }
    };
}).call(MutationObserver.prototype);

// Add to the mockdom environment
function addMutationObserver(window) {
    window.MutationObserver = MutationObserver;
    window.MutationRecord = MutationRecord;
}


// Add this to your existing initializers object
initializers.document = function() {
    this.createNodeIterator = function() {};
    this.createTreeWalker = function() {};
    addMutationObserver(this.defaultView || global);
};



/*
// Example usage in tests
const observer = new MutationObserver((mutations, observer) => {
    mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
            console.log('Child nodes changed');
            console.log('Added nodes:', mutation.addedNodes);
            console.log('Removed nodes:', mutation.removedNodes);
        } else if (mutation.type === 'attributes') {
            console.log('Attribute changed:', mutation.attributeName);
            console.log('Old value:', mutation.oldValue);
        }
    });
});

const target = new Node('div');
observer.observe(target, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeOldValue: true
});

// This will trigger a mutation
target.appendChild(new Node('span'));
target.setAttribute('class', 'new-class');
*/




class ResizeObserver {
    constructor(callback) {
        this.$observed = [];
        this.$callback = callback;
        this.$disconnected = false;
    }

    observe(element) {
        this.unobserve(element);

        var descW = Object.getOwnPropertyDescriptor(element.style.__proto__, "width");
        var descH = Object.getOwnPropertyDescriptor(element.style.__proto__, "height");
        var self = this;
        Object.defineProperty(element.style, "width", {
            configurable: true,
            enumerable: true,
            get: function () {
                return descW.get.call(this);
            },
            set: function (v) {
                descW.set.call(this, v);
                self.$emitChange(element);
            },
        });
        Object.defineProperty(element.style, "height", {
            configurable: true,
            enumerable: true,
            get: function () {
                return descH.get.call(this);
            },
            set: function (v) {
                descH.set.call(this, v);
                self.$emitChange(element);
            },
        });

        this.$observed.push(element);
        this.$emitChange(element);
        this.$disconnected = false;
    }

    unobserve(element) {
        delete element.style.width;
        delete element.style.height;
        this.$observed = this.$observed.filter((x) => x !== element);
    }

    disconnect() {
        this.$observed.forEach((e) => this.unobserve(e));
        this.$disconnected = true;
    }

    $emitChange(element) {
        if (this.$promise) return;
        this.$promise = new Promise(function (resolve) {
            resolve();
        }).then(() => {
            this.$promise = null;
            if (!element.ownerDocument.contains(element) || this.$disconnected) return;
            const rect = element.getBoundingClientRect();
            const sizeEntry = {inlineSize: rect.width, blockSize: rect.height};
            this.$callback([
                {
                    target: element,
                    contentRect: rect,
                    contentBoxSize: [sizeEntry],
                    borderBoxSize: [sizeEntry],
                    devicePixelContentBoxSize: [sizeEntry],
                },
            ]);
        });
    }
}



function Range() {
    this.startContainer = null;
    this.startOffset = 0;
    this.endContainer = null;
    this.endOffset = 0;
    this.commonAncestorContainer = null;
    this.collapsed = true;
}

(function() {
    this.setStart = function(node, offset) {
        this.startContainer = node;
        this.startOffset = offset;
        this._updateProperties();
    };

    this.setEnd = function(node, offset) {
        this.endContainer = node;
        this.endOffset = offset;
        this._updateProperties();
    };

    this.setStartBefore = function(node) {
        if (!node.parentNode) throw new Error("Invalid node");
        this.setStart(node.parentNode, this._getNodeIndex(node));
    };

    this.setStartAfter = function(node) {
        if (!node.parentNode) throw new Error("Invalid node");
        this.setStart(node.parentNode, this._getNodeIndex(node) + 1);
    };

    this.setEndBefore = function(node) {
        if (!node.parentNode) throw new Error("Invalid node");
        this.setEnd(node.parentNode, this._getNodeIndex(node));
    };

    this.setEndAfter = function(node) {
        if (!node.parentNode) throw new Error("Invalid node");
        this.setEnd(node.parentNode, this._getNodeIndex(node) + 1);
    };

    this.selectNode = function(node) {
        this.setStartBefore(node);
        this.setEndAfter(node);
    };

    this.selectNodeContents = function(node) {
        this.setStart(node, 0);
        this.setEnd(node, node.childNodes.length);
    };

    this.collapse = function(toStart) {
        if (toStart) {
            this.endContainer = this.startContainer;
            this.endOffset = this.startOffset;
        } else {
            this.startContainer = this.endContainer;
            this.startOffset = this.endOffset;
        }
        this._updateProperties();
    };

    this.cloneContents = function() {
        // Create a document fragment with the range's contents
        const fragment = new Node("#fragment");
        if (this.startContainer === this.endContainer && this.startContainer.nodeType === 3) {
            // Text node
            const text = new Node("#text");
            text.value = this.startContainer.value.substring(this.startOffset, this.endOffset);
            fragment.appendChild(text);
        }
        return fragment;
    };

    this.deleteContents = function() {
        if (this.collapsed) return;
        
        if (this.startContainer === this.endContainer && this.startContainer.nodeType === 3) {
            // Text node
            const text = this.startContainer.value;
            this.startContainer.value = text.substring(0, this.startOffset) + 
                                      text.substring(this.endOffset);
            this.collapse(true);
        }
    };

    this.extractContents = function() {
        const fragment = this.cloneContents();
        this.deleteContents();
        return fragment;
    };

    // Private helper methods
    this._updateProperties = function() {
        this.collapsed = (
            this.startContainer === this.endContainer && 
            this.startOffset === this.endOffset
        );
        this.commonAncestorContainer = this._findCommonAncestor();
    };

    this._getNodeIndex = function(node) {
        let index = 0;
        while (node.previousSibling) {
            node = node.previousSibling;
            index++;
        }
        return index;
    };

    this._findCommonAncestor = function() {
        if (!this.startContainer || !this.endContainer) return null;
        if (this.startContainer === this.endContainer) return this.startContainer;

        const startParents = this._getParents(this.startContainer);
        const endParents = this._getParents(this.endContainer);
        
        for (let i = 0; i < startParents.length; i++) {
            if (endParents.includes(startParents[i])) {
                return startParents[i];
            }
        }
        return null;
    };

    this._getParents = function(node) {
        const parents = [node];
        while (node.parentNode) {
            parents.unshift(node.parentNode);
            node = node.parentNode;
        }
        return parents;
    };
}).call(Range.prototype);

function Selection() {
    this._ranges = [];
    this.rangeCount = 0;
    this.isCollapsed = true;
}

(function() {
    this.addRange = function(range) {
        this._ranges.push(range);
        this.rangeCount = this._ranges.length;
        this.isCollapsed = range.collapsed;
    };

    this.removeRange = function(range) {
        const index = this._ranges.indexOf(range);
        if (index > -1) {
            this._ranges.splice(index, 1);
            this.rangeCount = this._ranges.length;
        }
    };

    this.removeAllRanges = function() {
        this._ranges = [];
        this.rangeCount = 0;
        this.isCollapsed = true;
    };

    this.getRangeAt = function(index) {
        return this._ranges[index] || null;
    };

    this.collapse = function(node, offset) {
        this.removeAllRanges();
        const range = new Range();
        range.setStart(node, offset);
        range.collapse(true);
        this.addRange(range);
    };

    this.toString = function() {
        if (this.rangeCount === 0) return "";
        return this._ranges[0].toString() || "";
    };
}).call(Selection.prototype);

// Add to Node prototype (document methods)
Node.prototype.createRange = function() {
    return new Range();
};

// Extend the existing window mock or create it
function Window() {
    this.getSelection = function() {
        if (!this._selection) {
            this._selection = new Selection();
        }
        return this._selection;
    };
}

// Update your existing initializers
initializers.document = function() {
    this.createRange = function() {
        return new Range();
    };
    
    this.defaultView = new Window();
    
    // Keep any existing document initializations
    if (this.createNodeIterator === undefined) {
        this.createNodeIterator = function() {};
    }
    if (this.createTreeWalker === undefined) {
        this.createTreeWalker = function() {};
    }
};
