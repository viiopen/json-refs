(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.JsonRefs = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (global){
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Jeremy Whitlock
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// Load promises polyfill if necessary
if (typeof Promise === 'undefined') {
  require('native-promise-only');
}

var _ = require('./lib/utils');
var pathLoader = require('path-loader');
var traverse = require('traverse');

var remoteCache = {};
var supportedSchemes = ['file', 'http', 'https'];

/**
 * Callback used by {@link resolveRefs}.
 *
 * @param {error} [err] - The error if there is a problem
 * @param {object} [resolved] - The resolved results
 * @param {object} [metadata] - The reference resolution metadata.  *(The key a JSON Pointer to a path in the resolved
 *                              document where a JSON Reference was dereferenced.  The value is also an object.  Every
 *                              metadata entry has a `ref` property to tell you where the dereferenced value came from.
 *                              If there is an `err` property, it is the `Error` object encountered retrieving the
 *                              referenced value.  If there is a `missing` property, it means the referenced value could
 *                              not be resolved.)*
 *
 * @callback resultCallback
 */

/**
 * Callback used to provide access to altering a remote request prior to the request being made.
 *
 * @param {object} req - The Superagent request object
 * @param {string} ref - The reference being resolved (When applicable)
 *
 * @callback prepareRequestCallback
 */

/**
 * Callback used to process the content of a reference.
 *
 * @param {string} content - The content loaded from the file/URL
 * @param {string} ref - The reference string (When applicable)
 * @param {object} [res] - The Superagent response object (For remote URL requests only)
 *
 * @returns {object} The JavaScript object representation of the reference
 *
 * @callback processContentCallback
 */

/* Internal Functions */

/**
 * Retrieves the content at the URL and returns its JSON content.
 *
 * @param {string} url - The URL to retrieve
 * @param {object} options - The options passed to resolveRefs
 *
 * @throws Error if there is a problem making the request or the content is not JSON
 *
 * @returns {Promise} The promise
 */
function getRemoteJson (url, options) {
  var json = remoteCache[url];
  var allTasks = Promise.resolve();
  var scheme = url.indexOf(':') === -1 ? undefined : url.split(':')[0];

  if (!_.isUndefined(json)) {
    allTasks = allTasks.then(function () {
      return json;
    });
  } else if (supportedSchemes.indexOf(scheme) === -1 && !_.isUndefined(scheme)) {
    allTasks = allTasks.then(function () {
      return Promise.reject(new Error('Unsupported remote reference scheme: ' + scheme));
    });
  } else {
    allTasks = pathLoader.load(url, options);

    if (options.processContent) {
      allTasks = allTasks.then(function (content) {
        return options.processContent(content, url);
      });
    } else {
      allTasks = allTasks.then(JSON.parse);
    }

    allTasks.then(function (nJson) {
      remoteCache[url] = nJson;

      return nJson;
    });
  }

  return allTasks;
}

/* Exported Functions */

/**
 * Clears the internal cache of url -> JavaScript object mappings based on previously resolved references.
 */
module.exports.clearCache = function clearCache () {
  remoteCache = {};
};

/**
 * Returns whether or not the object represents a JSON Reference.
 *
 * @param {object|string} [obj] - The object to check
 *
 * @returns {boolean} true if the argument is an object and its $ref property is a string and false otherwise
 */
var isJsonReference = module.exports.isJsonReference = function isJsonReference (obj) {
  // TODO: Add check that the value is a valid JSON Pointer
  return _.isPlainObject(obj) && _.isString(obj.$ref);
};

/**
 * Returns whether or not the object represents allOf array
 *
 * @param  {object}  obj - The object to check
 *
 * @returns {Boolean} true if the argument is an object and it has an array property allOf
 */
var isAllOf = module.exports.isAllOf = function isAllOf (obj) {
  return _.isPlainObject(obj) && _.isArray(obj.allOf);
};

/**
 * Takes an array of path segments and creates a JSON Pointer from it.
 *
 * @see {@link http://tools.ietf.org/html/rfc6901}
 *
 * @param {string[]} path - The path segments
 *
 * @returns {string} A JSON Pointer based on the path segments
 *
 * @throws Error if the arguments are missing or invalid
 */
var pathToPointer = module.exports.pathToPointer = function pathToPointer (path) {
  if (_.isUndefined(path)) {
    throw new Error('path is required');
  } else if (!_.isArray(path)) {
    throw new Error('path must be an array');
  }

  var ptr = '#';

  if (path.length > 0) {
    ptr += '/' + path.map(function (part) {
      return part.replace(/~/g, '~0').replace(/\//g, '~1');
    }).join('/');
  }

  return ptr;
};

/**
 * Find all JSON References in the document.
 *
 * @see {@link http://tools.ietf.org/html/draft-pbryan-zyp-json-ref-03#section-3}
 *
 * @param {object} json - The JSON document to find references in
 *
 * @returns {object} An object whose keys are JSON Pointers to the '$ref' node of the JSON Reference
 *
 * @throws Error if the arguments are missing or invalid
 */
var findRefs = module.exports.findRefs = function findRefs (json) {
  if (_.isUndefined(json)) {
    throw new Error('json is required');
  } else if (!_.isPlainObject(json)) {
    throw new Error('json must be an object');
  }

  return traverse(json).reduce(function (acc) {
    var val = this.node;

    if (this.key === '$ref' && isJsonReference(this.parent.node)) {
      acc[pathToPointer(this.path)] = val;
    }

    return acc;
  }, {});
};

var findAllOfs = module.exports.findAllOfs = function findAllOfs (json) {
  if (_.isUndefined(json)) {
    throw new Error('json is required');
  } else if (!_.isPlainObject(json)) {
    throw new Error('json must be an object');
  }

  return traverse(json).reduce(function (acc) {
    var val = this.node;

    if (this.key === 'allOf' && isAllOf(this.parent.node)) {
      acc[pathToPointer(this.path)] = val;
    }

    return acc;
  }, {});
};

/**
 * Returns whether or not the JSON Pointer is a remote reference.
 *
 * @param {string} ptr - The JSON Pointer
 *
 * @returns {boolean} true if the JSON Pointer is remote or false if not
 *
 * @throws Error if the arguments are missing or invalid
 */
var isRemotePointer = module.exports.isRemotePointer = function isRemotePointer (ptr) {
  if (_.isUndefined(ptr)) {
    throw new Error('ptr is required');
  } else if (!_.isString(ptr)) {
    throw new Error('ptr must be a string');
  }

  // We treat anything other than local, valid JSON Pointer values as remote
  return ptr !== '' && ptr.charAt(0) !== '#';
};

/**
 * Takes a JSON Reference and returns an array of path segments.
 *
 * @see {@link http://tools.ietf.org/html/rfc6901}
 *
 * @param {string} ptr - The JSON Pointer for the JSON Reference
 *
 * @returns {string[]} An array of path segments or the passed in string if it is a remote reference
 *
 * @throws Error if the arguments are missing or invalid
 */
var pathFromPointer = module.exports.pathFromPointer = function pathFromPointer (ptr) {
  if (_.isUndefined(ptr)) {
    throw new Error('ptr is required');
  } else if (!_.isString(ptr)) {
    throw new Error('ptr must be a string');
  }

  var path = [];
  var rootPaths = ['', '#', '#/'];

  if (isRemotePointer(ptr)) {
    path = ptr;
  } else {
    if (rootPaths.indexOf(ptr) === -1 && ptr.charAt(0) === '#') {
      path = ptr.substring(ptr.indexOf('/')).split('/').reduce(function (parts, part) {
        if (part !== '') {
          parts.push(part.replace(/~0/g, '~').replace(/~1/g, '/'));
        }

        return parts;
      }, []);
    }
  }

  return path;
};

function combineRefs (base, ref) {
  var basePath = pathFromPointer(base);

  if (isRemotePointer(ref)) {
    if (ref.indexOf('#') === -1) {
      ref = '#';
    } else {
      ref = ref.substring(ref.indexOf('#'));
    }
  }

  return pathToPointer(basePath.concat(pathFromPointer(ref))).replace(/\/\$ref/g, '');
}

function computeUrl (base, ref) {
  var isRelative = ref.charAt(0) !== '#' && ref.indexOf(':') === -1;
  var isRootRelative = isRelative && ref.charAt(0) === '/';
  var newLocation = [];
  var refSegments = (ref.indexOf('#') > -1 ? ref.split('#')[0] : ref).split('/');

  function segmentHandler (segment) {
    if (segment === '..') {
      newLocation.pop();
    } else if (segment !== '.') {
      newLocation.push(segment);
    }
  }

  // Remove trailing slash
  if (base && base.length > 1 && base[base.length - 1] === '/') {
    base = base.substring(0, base.length - 1);
  }

  // Normalize the base (when available)
  if (base) {
    base.split('#')[0].split('/').forEach(segmentHandler);
  }

  if (isRelative) {
    // Add reference segments
    (base && isRootRelative ? refSegments.slice(1) : refSegments).forEach(segmentHandler);
  } else {
    newLocation = refSegments;
  }

  return newLocation.join('/');
}

function realResolveRefs (json, options, metadata) {
  var depth = _.isUndefined(options.depth) ? 1 : options.depth;
  var jsonT = traverse(json);
  var allOfs;

  function findParentReference (path) {
    var pPath = path.slice(0, path.lastIndexOf('allOf'));
    var refMetadata = metadata[pathToPointer(pPath)];

    if (!_.isUndefined(refMetadata)) {
      return pathToPointer(pPath);
    } else {
      if (pPath.indexOf('allOf') > -1) {
        return findParentReference(pPath);
      } else {
        return undefined;
      }
    }
  }

  function fixCirculars (rJsonT) {
    var circularPtrs = [];
    var scrubbed = rJsonT.map(function () {
      var ptr = pathToPointer(this.path);
      var refMetadata = metadata[ptr];
      var pPtr;

      if (this.circular) {
        circularPtrs.push(ptr);

        if (_.isUndefined(refMetadata)) {
          // This must be circular composition/inheritance
          pPtr = findParentReference(this.path);
          refMetadata = metadata[pPtr];
        }

        // Reference metadata can be undefined for references to schemas that have circular composition/inheritance and
        // are safely ignoreable.
        if (!_.isUndefined(refMetadata)) {
          refMetadata.circular = true;
        }

        if (depth === 0) {
          this.update({});
        } else {
          this.update(traverse(this.node).map(function () {
            if (this.circular) {
              this.parent.update({});
            }
          }));
        }
      }
    });

    // Replace scrubbed circulars based on depth
    _.each(circularPtrs, function (ptr) {
      var depthPath = [];
      var path = pathFromPointer(ptr);
      var value = traverse(scrubbed).get(path);
      var i;

      for (i = 0; i < depth; i++) {
        depthPath.push.apply(depthPath, path);

        traverse(scrubbed).set(depthPath, _.cloneDeep(value));
      }
    });

    return scrubbed;
  }

  function replaceAllOf (allOf, allOfPtr) {
    var localPath = pathFromPointer(allOfPtr);
    var value = jsonT.get(localPath);
    var allOfPtrPath = pathFromPointer(allOfPtr);
    var parentPath = allOfPtrPath.slice(0, allOfPtrPath.length - 1);

    var source = jsonT.get(parentPath);

    if (!source) {
      return;
    }

    options.collapseAllOf.apply(source, value);
    delete source.allOf;
  }

  function replaceReference (ref, refPtr) {
    var refMetadataKey = combineRefs(refPtr, '#');
    var localRef = ref = ref.indexOf('#') === -1 ?
          '#' :
          ref.substring(ref.indexOf('#'));
    var localPath = pathFromPointer(localRef);
    var missing = !jsonT.has(localPath);
    var value = jsonT.get(localPath);
    var refPtrPath = pathFromPointer(refPtr);
    var parentPath = refPtrPath.slice(0, refPtrPath.length - 1);
    var refMetadata = metadata[refMetadataKey] || {
      ref: ref
    };

    if (!missing) {
      if (parentPath.length === 0) {
        // Self references are special
        if (jsonT.value === value) {
          value = {};

          refMetadata.circular = true;
        }

        jsonT.value = value;
      } else {
        if (jsonT.get(parentPath) === value) {
          value = {};

          refMetadata.circular = true;
        }

        jsonT.set(parentPath, value);
      }
    } else {
      refMetadata.missing = true;
    }

    metadata[refMetadataKey] = refMetadata;
  }

  // All references at this point should be local except missing/invalid references
  _.each(findRefs(json), function (ref, refPtr) {
    if (!isRemotePointer(ref)) {
      replaceReference(ref, refPtr);
    }
  });

  if (options.collapseAllOf) {
    // Nested allofs must be handled in reverse order
    // so we make an array and reverse it to get our
    // order of operations
    allOfs = findAllOfs(json);
    Object.keys(allOfs).reverse().map(function (key) {
      replaceAllOf(allOfs[key], key);
    });
  }

  // Remove full locations from reference metadata
  if (!_.isUndefined(options.location)) {
    _.each(metadata, function (refMetadata) {
      var normalizedPtr = refMetadata.ref;

      // Remove the base
      normalizedPtr = normalizedPtr.replace(options.location, '');

      // Remove the / prefix
      if (normalizedPtr.charAt(0) === '/') {
        normalizedPtr = normalizedPtr.substring(1);
      }

      refMetadata.ref = normalizedPtr;
    });
  }

  // Fix circulars
  return {
    metadata: metadata,
    resolved: fixCirculars(jsonT)
  };
}

function resolveRemoteRefs (json, options, parentPtr, parents, metadata) {
  var allTasks = Promise.resolve();
  var jsonT = traverse(json);

  function replaceRemoteRef (refPtr, ptr, remoteLocation, remotePtr, resolved) {
    var normalizedPtr = remoteLocation + (remotePtr === '#' ? '' : remotePtr);
    var refMetadataKey = combineRefs(parentPtr, refPtr);
    var refMetadata = metadata[refMetadataKey] || {};
    var refPath = pathFromPointer(refPtr);
    var value;


    if (_.isUndefined(resolved)) {
      refMetadata.circular = true;

      // Use the parent reference loocation
      value = parents[remoteLocation].ref;
    } else {
      // Get the remote value
      value = traverse(resolved).get(pathFromPointer(remotePtr));

      // If the remote value is itself a reference, update the reference to be replaced with its reference value.
      // Otherwise, replace the remote reference.
      if (value.$ref) {
        value = value.$ref;
      } else {
        refPath.pop();
      }
    }

    // Collapse self references
    if (refPath.length === 0) {
      jsonT.value = value;
    } else {
      jsonT.set(refPath, value);
    }

    refMetadata.ref = normalizedPtr;

    metadata[refMetadataKey] = refMetadata;
  }

  function resolver () {
    return {
      metadata: metadata,
      resolved: jsonT.value
    };
  }

  _.each(findRefs(json), function (ptr, refPtr) {
    if (isRemotePointer(ptr)) {
      allTasks = allTasks.then(function () {
        var remoteLocation = computeUrl(options.location, ptr);
        var refParts = ptr.split('#');
        var hash = '#' + (refParts[1] || '');

        if (_.isUndefined(parents[remoteLocation])) {
          return getRemoteJson(remoteLocation, options)
            .then(function (remoteJson) {
              return remoteJson;
            }, function (err) {
              return err;
            })
            .then(function (response) {
              var refBase = refParts[0];
              var rOptions = _.cloneDeep(options);
              var newParentPtr = combineRefs(parentPtr, refPtr);

              // Remove the last path segment
              refBase = refBase.substring(0, refBase.lastIndexOf('/') + 1);

              // Update the recursive location
              rOptions.location = computeUrl(options.location, refBase);

              // Record the parent
              parents[remoteLocation] = {
                ref: parentPtr
              };

              if (_.isError(response)) {
                metadata[newParentPtr] = {
                  err: response,
                  missing: true,
                  ref: ptr
                };
              } else {
                // Resolve remote references
                return resolveRemoteRefs(response, rOptions, newParentPtr, parents, metadata)
                  .then(function (rMetadata) {
                    delete parents[remoteLocation];

                    replaceRemoteRef(refPtr, ptr, remoteLocation, hash, rMetadata.resolved);
                  });
              }
            });
        } else {
          // This is a circular reference
          replaceRemoteRef(refPtr, ptr, remoteLocation, hash);
        }
      });
    }
  });

  allTasks = allTasks.then(resolver, resolver);

  return allTasks;
}

/**
 * Takes a JSON document, resolves all JSON References and returns a fully resolved equivalent along with reference
 * resolution metadata.
 *
 * **Important Details**
 *
 * * The input arguments are never altered
 * * When using promises, only one value can be resolved so it is an object whose keys and values are the same name and
 *   value as arguments 1 and 2 for {@link resultCallback}
 *
 * @param {object} json - The JSON  document having zero or more JSON References
 * @param {object} [options] - The options (All options are passed down to whitlockjc/path-loader)
 * @param {number} [options.depth=1] - The depth to resolve circular references
 * @param {string} [options.location] - The location to which relative references should be resolved
 * @param {prepareRequestCallback} [options.prepareRequest] - The callback used to prepare an HTTP request
 * @param {processContentCallback} [options.processContent] - The callback used to process a reference's content
 * @param {resultCallback} [done] - The result callback
 *
 * @throws Error if the arguments are missing or invalid
 *
 * @returns {Promise} The promise.
 *
 * @example
 * // Example using callbacks
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }, function (err, resolved, metadata) {
 *   if (err) throw err;
 *
 *   console.log(JSON.stringify(resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 *
 * @example
 * // Example using promises
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }).then(function (results) {
 *   console.log(JSON.stringify(results.resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(results.metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 *
 * @example
 * // Example using options.prepareRequest (to add authentication credentials) and options.processContent (to process YAML)
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }, {
 *   prepareRequest: function (req) {
 *     // Add the 'Basic Authentication' credentials
 *     req.auth('whitlockjc', 'MY_GITHUB_PASSWORD');
 *
 *     // Add the 'X-API-Key' header for an API Key based authentication
 *     // req.set('X-API-Key', 'MY_API_KEY');
 *   },
 *   processContent: function (content) {
 *     return YAML.parse(content);
 *   }
 * }).then(function (results) {
 *   console.log(JSON.stringify(results.resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(results.metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 */
module.exports.resolveRefs = function resolveRefs (json, options, done) {
  var allTasks = Promise.resolve();

  if (arguments.length === 2) {
    if (_.isFunction(options)) {
      done = options;
      options = {};
    }
  }

  if (_.isUndefined(options)) {
    options = {};
  }

  allTasks = allTasks.then(function () {
    if (_.isUndefined(json)) {
      throw new Error('json is required');
    } else if (!_.isPlainObject(json)) {
      throw new Error('json must be an object');
    } else if (!_.isPlainObject(options)) {
      throw new Error('options must be an object');
    } else if (!_.isUndefined(done) && !_.isFunction(done)) {
      throw new Error('done must be a function');
    }

    // Validate the options (This option does not apply to )
    if (!_.isUndefined(options.processContent) && !_.isFunction(options.processContent)) {
      throw new Error('options.processContent must be a function');
    } else if (!_.isUndefined(options.prepareRequest) && !_.isFunction(options.prepareRequest)) {
      throw new Error('options.prepareRequest must be a function');
    } else if (!_.isUndefined(options.location) && !_.isString(options.location)) {
      throw new Error('options.location must be a string');
    } else if (!_.isUndefined(options.depth) && !_.isNumber(options.depth)) {
      throw new Error('options.depth must be a number');
    } else if (!_.isUndefined(options.depth) && options.depth < 0) {
      throw new Error('options.depth must be greater or equal to zero');
    }
  });

  // Clone the inputs so we do not alter them
  json = traverse(json).clone();
  options = traverse(options).clone();

  allTasks = allTasks
    .then(function () {
      return resolveRemoteRefs(json, options, '#', {}, {});
    })
    .then(function (metadata) {
      return realResolveRefs(metadata.resolved, options, metadata.metadata);
    });

  // Use the callback if provided and it is a function
  if (!_.isUndefined(done) && _.isFunction(done)) {
    allTasks = allTasks
      .then(function (results) {
        done(undefined, results.resolved, results.metadata);
      }, function (err) {
        done(err);
      });
  }

  return allTasks;
};

/**
 * Takes a JSON document, resolves all JSON References and returns a fully resolved equivalent along with reference
 * resolution metadata.
 *
 * **Important Details**
 *
 * * The input arguments are never altered
 * * When using promises, only one value can be resolved so it is an object whose keys and values are the same name and
 *   value as arguments 1 and 2 for {@link resultCallback}
 *
 * @param {object} json - The JSON  document having zero or more JSON References
 * @param {object} [options] - The options (All options are passed down to whitlockjc/path-loader)
 * @param {number} [options.depth=1] - The depth to resolve circular references
 * @param {string} [options.location] - The location to which relative references should be resolved
 * @param {prepareRequestCallback} [options.prepareRequest] - The callback used to prepare an HTTP request
 * @param {processContentCallback} [options.processContent] - The callback used to process a reference's content
 * @param {resultCallback} [done] - The result callback
 *
 * @throws Error if the arguments are missing or invalid
 *
 * @returns {Promise} The promise.
 *
 * @example
 * // Example using callbacks
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }, function (err, resolved, metadata) {
 *   if (err) throw err;
 *
 *   console.log(JSON.stringify(resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 *
 * @example
 * // Example using promises
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }).then(function (results) {
 *   console.log(JSON.stringify(results.resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(results.metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 *
 * @example
 * // Example using options.prepareRequest (to add authentication credentials) and options.processContent (to process YAML)
 *
 * JsonRefs.resolveRefs({
 *   name: 'json-refs',
 *   owner: {
 *     $ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'
 *   }
 * }, {
 *   prepareRequest: function (req) {
 *     // Add the 'Basic Authentication' credentials
 *     req.auth('whitlockjc', 'MY_GITHUB_PASSWORD');
 *
 *     // Add the 'X-API-Key' header for an API Key based authentication
 *     // req.set('X-API-Key', 'MY_API_KEY');
 *   },
 *   processContent: function (content) {
 *     return YAML.parse(content);
 *   }
 * }).then(function (results) {
 *   console.log(JSON.stringify(results.resolved)); // {name: 'json-refs', owner: { ... }}
 *   console.log(JSON.stringify(results.metadata)); // {'#/owner': {ref: 'https://api.github.com/repos/whitlockjc/json-refs#/owner'}}
 * });
 */
module.exports.resolveRefs = function resolveRefs (json, options, done) {
  var allTasks = Promise.resolve();

  if (arguments.length === 2) {
    if (_.isFunction(options)) {
      done = options;
      options = {};
    }
  }

  if (_.isUndefined(options)) {
    options = {};
  }

  allTasks = allTasks.then(function () {
    if (_.isUndefined(json)) {
      throw new Error('json is required');
    } else if (!_.isPlainObject(json)) {
      throw new Error('json must be an object');
    } else if (!_.isPlainObject(options)) {
      throw new Error('options must be an object');
    } else if (!_.isUndefined(done) && !_.isFunction(done)) {
      throw new Error('done must be a function');
    }

    // Validate the options (This option does not apply to )
    if (!_.isUndefined(options.processContent) && !_.isFunction(options.processContent)) {
      throw new Error('options.processContent must be a function');
    } else if (!_.isUndefined(options.prepareRequest) && !_.isFunction(options.prepareRequest)) {
      throw new Error('options.prepareRequest must be a function');
    } else if (!_.isUndefined(options.location) && !_.isString(options.location)) {
      throw new Error('options.location must be a string');
    } else if (!_.isUndefined(options.depth) && !_.isNumber(options.depth)) {
      throw new Error('options.depth must be a number');
    } else if (!_.isUndefined(options.depth) && options.depth < 0) {
      throw new Error('options.depth must be greater or equal to zero');
    }
  });

  // Clone the inputs so we do not alter them
  json = traverse(json).clone();
  options = traverse(options).clone();

  allTasks = allTasks
    .then(function () {
      return resolveRemoteRefs(json, options, '#', {}, {});
    })
    .then(function (metadata) {
      return realResolveRefs(metadata.resolved, options, metadata.metadata);
    });

  // Use the callback if provided and it is a function
  if (!_.isUndefined(done) && _.isFunction(done)) {
    allTasks = allTasks
      .then(function (results) {
        done(undefined, results.resolved, results.metadata);
      }, function (err) {
        done(err);
      });
  }

  return allTasks;
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"./lib/utils":2,"native-promise-only":3}],2:[function(require,module,exports){
(function (global){
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Jeremy Whitlock
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

'use strict';

// This is a simple wrapper for Lodash functions but using simple ES5 and existing required dependencies
// (cloneDeep uses traverse for example).  The reason for this was a much smaller file size.  All exported functions
// match map to a lodash equivalent.

var traverse = (typeof window !== "undefined" ? window['traverse'] : typeof global !== "undefined" ? global['traverse'] : null);

function isType (obj, type) {
  return Object.prototype.toString.call(obj) === '[object ' + type + ']';
}

module.exports.cloneDeep = function (obj) {
  return traverse(obj).clone();
};

var isArray = module.exports.isArray = function (obj) {
  return isType(obj, 'Array');
};

module.exports.isError = function (obj) {
  return isType(obj, 'Error');
};

module.exports.isFunction = function (obj) {
  return isType(obj, 'Function');
};

module.exports.isNumber = function (obj) {
  return isType(obj, 'Number');
};

var isPlainObject = module.exports.isPlainObject = function (obj) {
  return isType(obj, 'Object');
};

module.exports.isString = function (obj) {
  return isType(obj, 'String');
};

module.exports.isUndefined = function (obj) {
  // Commented out due to PhantomJS bug (https://github.com/ariya/phantomjs/issues/11722)
  // return isType(obj, 'Undefined');
  return typeof obj === 'undefined';
};

module.exports.each = function (source, handler) {
  if (isArray(source)) {
    source.forEach(handler);
  } else if (isPlainObject(source)) {
    Object.keys(source).forEach(function (key) {
      handler(source[key], key);
    });
  }
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}],3:[function(require,module,exports){
(function (global){
/*! Native Promise Only
    v0.8.1 (c) Kyle Simpson
    MIT License: http://getify.mit-license.org
*/

(function UMD(name,context,definition){
	// special form of UMD for polyfilling across evironments
	context[name] = context[name] || definition();
	if (typeof module != "undefined" && module.exports) { module.exports = context[name]; }
	else if (typeof define == "function" && define.amd) { define(function $AMD$(){ return context[name]; }); }
})("Promise",typeof global != "undefined" ? global : this,function DEF(){
	/*jshint validthis:true */
	"use strict";

	var builtInProp, cycle, scheduling_queue,
		ToString = Object.prototype.toString,
		timer = (typeof setImmediate != "undefined") ?
			function timer(fn) { return setImmediate(fn); } :
			setTimeout
	;

	// dammit, IE8.
	try {
		Object.defineProperty({},"x",{});
		builtInProp = function builtInProp(obj,name,val,config) {
			return Object.defineProperty(obj,name,{
				value: val,
				writable: true,
				configurable: config !== false
			});
		};
	}
	catch (err) {
		builtInProp = function builtInProp(obj,name,val) {
			obj[name] = val;
			return obj;
		};
	}

	// Note: using a queue instead of array for efficiency
	scheduling_queue = (function Queue() {
		var first, last, item;

		function Item(fn,self) {
			this.fn = fn;
			this.self = self;
			this.next = void 0;
		}

		return {
			add: function add(fn,self) {
				item = new Item(fn,self);
				if (last) {
					last.next = item;
				}
				else {
					first = item;
				}
				last = item;
				item = void 0;
			},
			drain: function drain() {
				var f = first;
				first = last = cycle = void 0;

				while (f) {
					f.fn.call(f.self);
					f = f.next;
				}
			}
		};
	})();

	function schedule(fn,self) {
		scheduling_queue.add(fn,self);
		if (!cycle) {
			cycle = timer(scheduling_queue.drain);
		}
	}

	// promise duck typing
	function isThenable(o) {
		var _then, o_type = typeof o;

		if (o != null &&
			(
				o_type == "object" || o_type == "function"
			)
		) {
			_then = o.then;
		}
		return typeof _then == "function" ? _then : false;
	}

	function notify() {
		for (var i=0; i<this.chain.length; i++) {
			notifyIsolated(
				this,
				(this.state === 1) ? this.chain[i].success : this.chain[i].failure,
				this.chain[i]
			);
		}
		this.chain.length = 0;
	}

	// NOTE: This is a separate function to isolate
	// the `try..catch` so that other code can be
	// optimized better
	function notifyIsolated(self,cb,chain) {
		var ret, _then;
		try {
			if (cb === false) {
				chain.reject(self.msg);
			}
			else {
				if (cb === true) {
					ret = self.msg;
				}
				else {
					ret = cb.call(void 0,self.msg);
				}

				if (ret === chain.promise) {
					chain.reject(TypeError("Promise-chain cycle"));
				}
				else if (_then = isThenable(ret)) {
					_then.call(ret,chain.resolve,chain.reject);
				}
				else {
					chain.resolve(ret);
				}
			}
		}
		catch (err) {
			chain.reject(err);
		}
	}

	function resolve(msg) {
		var _then, self = this;

		// already triggered?
		if (self.triggered) { return; }

		self.triggered = true;

		// unwrap
		if (self.def) {
			self = self.def;
		}

		try {
			if (_then = isThenable(msg)) {
				schedule(function(){
					var def_wrapper = new MakeDefWrapper(self);
					try {
						_then.call(msg,
							function $resolve$(){ resolve.apply(def_wrapper,arguments); },
							function $reject$(){ reject.apply(def_wrapper,arguments); }
						);
					}
					catch (err) {
						reject.call(def_wrapper,err);
					}
				})
			}
			else {
				self.msg = msg;
				self.state = 1;
				if (self.chain.length > 0) {
					schedule(notify,self);
				}
			}
		}
		catch (err) {
			reject.call(new MakeDefWrapper(self),err);
		}
	}

	function reject(msg) {
		var self = this;

		// already triggered?
		if (self.triggered) { return; }

		self.triggered = true;

		// unwrap
		if (self.def) {
			self = self.def;
		}

		self.msg = msg;
		self.state = 2;
		if (self.chain.length > 0) {
			schedule(notify,self);
		}
	}

	function iteratePromises(Constructor,arr,resolver,rejecter) {
		for (var idx=0; idx<arr.length; idx++) {
			(function IIFE(idx){
				Constructor.resolve(arr[idx])
				.then(
					function $resolver$(msg){
						resolver(idx,msg);
					},
					rejecter
				);
			})(idx);
		}
	}

	function MakeDefWrapper(self) {
		this.def = self;
		this.triggered = false;
	}

	function MakeDef(self) {
		this.promise = self;
		this.state = 0;
		this.triggered = false;
		this.chain = [];
		this.msg = void 0;
	}

	function Promise(executor) {
		if (typeof executor != "function") {
			throw TypeError("Not a function");
		}

		if (this.__NPO__ !== 0) {
			throw TypeError("Not a promise");
		}

		// instance shadowing the inherited "brand"
		// to signal an already "initialized" promise
		this.__NPO__ = 1;

		var def = new MakeDef(this);

		this["then"] = function then(success,failure) {
			var o = {
				success: typeof success == "function" ? success : true,
				failure: typeof failure == "function" ? failure : false
			};
			// Note: `then(..)` itself can be borrowed to be used against
			// a different promise constructor for making the chained promise,
			// by substituting a different `this` binding.
			o.promise = new this.constructor(function extractChain(resolve,reject) {
				if (typeof resolve != "function" || typeof reject != "function") {
					throw TypeError("Not a function");
				}

				o.resolve = resolve;
				o.reject = reject;
			});
			def.chain.push(o);

			if (def.state !== 0) {
				schedule(notify,def);
			}

			return o.promise;
		};
		this["catch"] = function $catch$(failure) {
			return this.then(void 0,failure);
		};

		try {
			executor.call(
				void 0,
				function publicResolve(msg){
					resolve.call(def,msg);
				},
				function publicReject(msg) {
					reject.call(def,msg);
				}
			);
		}
		catch (err) {
			reject.call(def,err);
		}
	}

	var PromisePrototype = builtInProp({},"constructor",Promise,
		/*configurable=*/false
	);

	// Note: Android 4 cannot use `Object.defineProperty(..)` here
	Promise.prototype = PromisePrototype;

	// built-in "brand" to signal an "uninitialized" promise
	builtInProp(PromisePrototype,"__NPO__",0,
		/*configurable=*/false
	);

	builtInProp(Promise,"resolve",function Promise$resolve(msg) {
		var Constructor = this;

		// spec mandated checks
		// note: best "isPromise" check that's practical for now
		if (msg && typeof msg == "object" && msg.__NPO__ === 1) {
			return msg;
		}

		return new Constructor(function executor(resolve,reject){
			if (typeof resolve != "function" || typeof reject != "function") {
				throw TypeError("Not a function");
			}

			resolve(msg);
		});
	});

	builtInProp(Promise,"reject",function Promise$reject(msg) {
		return new this(function executor(resolve,reject){
			if (typeof resolve != "function" || typeof reject != "function") {
				throw TypeError("Not a function");
			}

			reject(msg);
		});
	});

	builtInProp(Promise,"all",function Promise$all(arr) {
		var Constructor = this;

		// spec mandated checks
		if (ToString.call(arr) != "[object Array]") {
			return Constructor.reject(TypeError("Not an array"));
		}
		if (arr.length === 0) {
			return Constructor.resolve([]);
		}

		return new Constructor(function executor(resolve,reject){
			if (typeof resolve != "function" || typeof reject != "function") {
				throw TypeError("Not a function");
			}

			var len = arr.length, msgs = Array(len), count = 0;

			iteratePromises(Constructor,arr,function resolver(idx,msg) {
				msgs[idx] = msg;
				if (++count === len) {
					resolve(msgs);
				}
			},reject);
		});
	});

	builtInProp(Promise,"race",function Promise$race(arr) {
		var Constructor = this;

		// spec mandated checks
		if (ToString.call(arr) != "[object Array]") {
			return Constructor.reject(TypeError("Not an array"));
		}

		return new Constructor(function executor(resolve,reject){
			if (typeof resolve != "function" || typeof reject != "function") {
				throw TypeError("Not a function");
			}

			iteratePromises(Constructor,arr,function resolver(idx,msg){
				resolve(msg);
			},reject);
		});
	});

	return Promise;
});

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJpbmRleC5qcyIsImxpYi91dGlscy5qcyIsIm5vZGVfbW9kdWxlcy9uYXRpdmUtcHJvbWlzZS1vbmx5L2xpYi9ucG8uc3JjLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7QUMxdUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDL0VBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiAqIFRoZSBNSVQgTGljZW5zZSAoTUlUKVxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNCBKZXJlbXkgV2hpdGxvY2tcbiAqXG4gKiBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4gKiBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSBcIlNvZnR3YXJlXCIpLCB0byBkZWFsXG4gKiBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzXG4gKiB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsXG4gKiBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbiAqIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4gKlxuICogVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbiAqIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuICpcbiAqIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1JcbiAqIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuICogRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4gKiBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSXG4gKiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLFxuICogT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTlxuICogVEhFIFNPRlRXQVJFLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gTG9hZCBwcm9taXNlcyBwb2x5ZmlsbCBpZiBuZWNlc3NhcnlcbmlmICh0eXBlb2YgUHJvbWlzZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgcmVxdWlyZSgnbmF0aXZlLXByb21pc2Utb25seScpO1xufVxuXG52YXIgXyA9IHJlcXVpcmUoJy4vbGliL3V0aWxzJyk7XG52YXIgcGF0aExvYWRlciA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93WydQYXRoTG9hZGVyJ10gOiB0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsWydQYXRoTG9hZGVyJ10gOiBudWxsKTtcbnZhciB0cmF2ZXJzZSA9ICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93Wyd0cmF2ZXJzZSddIDogdHlwZW9mIGdsb2JhbCAhPT0gXCJ1bmRlZmluZWRcIiA/IGdsb2JhbFsndHJhdmVyc2UnXSA6IG51bGwpO1xuXG52YXIgcmVtb3RlQ2FjaGUgPSB7fTtcbnZhciBzdXBwb3J0ZWRTY2hlbWVzID0gWydmaWxlJywgJ2h0dHAnLCAnaHR0cHMnXTtcblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIGJ5IHtAbGluayByZXNvbHZlUmVmc30uXG4gKlxuICogQHBhcmFtIHtlcnJvcn0gW2Vycl0gLSBUaGUgZXJyb3IgaWYgdGhlcmUgaXMgYSBwcm9ibGVtXG4gKiBAcGFyYW0ge29iamVjdH0gW3Jlc29sdmVkXSAtIFRoZSByZXNvbHZlZCByZXN1bHRzXG4gKiBAcGFyYW0ge29iamVjdH0gW21ldGFkYXRhXSAtIFRoZSByZWZlcmVuY2UgcmVzb2x1dGlvbiBtZXRhZGF0YS4gICooVGhlIGtleSBhIEpTT04gUG9pbnRlciB0byBhIHBhdGggaW4gdGhlIHJlc29sdmVkXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRvY3VtZW50IHdoZXJlIGEgSlNPTiBSZWZlcmVuY2Ugd2FzIGRlcmVmZXJlbmNlZC4gIFRoZSB2YWx1ZSBpcyBhbHNvIGFuIG9iamVjdC4gIEV2ZXJ5XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1ldGFkYXRhIGVudHJ5IGhhcyBhIGByZWZgIHByb3BlcnR5IHRvIHRlbGwgeW91IHdoZXJlIHRoZSBkZXJlZmVyZW5jZWQgdmFsdWUgY2FtZSBmcm9tLlxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJZiB0aGVyZSBpcyBhbiBgZXJyYCBwcm9wZXJ0eSwgaXQgaXMgdGhlIGBFcnJvcmAgb2JqZWN0IGVuY291bnRlcmVkIHJldHJpZXZpbmcgdGhlXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlZmVyZW5jZWQgdmFsdWUuICBJZiB0aGVyZSBpcyBhIGBtaXNzaW5nYCBwcm9wZXJ0eSwgaXQgbWVhbnMgdGhlIHJlZmVyZW5jZWQgdmFsdWUgY291bGRcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm90IGJlIHJlc29sdmVkLikqXG4gKlxuICogQGNhbGxiYWNrIHJlc3VsdENhbGxiYWNrXG4gKi9cblxuLyoqXG4gKiBDYWxsYmFjayB1c2VkIHRvIHByb3ZpZGUgYWNjZXNzIHRvIGFsdGVyaW5nIGEgcmVtb3RlIHJlcXVlc3QgcHJpb3IgdG8gdGhlIHJlcXVlc3QgYmVpbmcgbWFkZS5cbiAqXG4gKiBAcGFyYW0ge29iamVjdH0gcmVxIC0gVGhlIFN1cGVyYWdlbnQgcmVxdWVzdCBvYmplY3RcbiAqIEBwYXJhbSB7c3RyaW5nfSByZWYgLSBUaGUgcmVmZXJlbmNlIGJlaW5nIHJlc29sdmVkIChXaGVuIGFwcGxpY2FibGUpXG4gKlxuICogQGNhbGxiYWNrIHByZXBhcmVSZXF1ZXN0Q2FsbGJhY2tcbiAqL1xuXG4vKipcbiAqIENhbGxiYWNrIHVzZWQgdG8gcHJvY2VzcyB0aGUgY29udGVudCBvZiBhIHJlZmVyZW5jZS5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gY29udGVudCAtIFRoZSBjb250ZW50IGxvYWRlZCBmcm9tIHRoZSBmaWxlL1VSTFxuICogQHBhcmFtIHtzdHJpbmd9IHJlZiAtIFRoZSByZWZlcmVuY2Ugc3RyaW5nIChXaGVuIGFwcGxpY2FibGUpXG4gKiBAcGFyYW0ge29iamVjdH0gW3Jlc10gLSBUaGUgU3VwZXJhZ2VudCByZXNwb25zZSBvYmplY3QgKEZvciByZW1vdGUgVVJMIHJlcXVlc3RzIG9ubHkpXG4gKlxuICogQHJldHVybnMge29iamVjdH0gVGhlIEphdmFTY3JpcHQgb2JqZWN0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSByZWZlcmVuY2VcbiAqXG4gKiBAY2FsbGJhY2sgcHJvY2Vzc0NvbnRlbnRDYWxsYmFja1xuICovXG5cbi8qIEludGVybmFsIEZ1bmN0aW9ucyAqL1xuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgY29udGVudCBhdCB0aGUgVVJMIGFuZCByZXR1cm5zIGl0cyBKU09OIGNvbnRlbnQuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHVybCAtIFRoZSBVUkwgdG8gcmV0cmlldmVcbiAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zIC0gVGhlIG9wdGlvbnMgcGFzc2VkIHRvIHJlc29sdmVSZWZzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGVyZSBpcyBhIHByb2JsZW0gbWFraW5nIHRoZSByZXF1ZXN0IG9yIHRoZSBjb250ZW50IGlzIG5vdCBKU09OXG4gKlxuICogQHJldHVybnMge1Byb21pc2V9IFRoZSBwcm9taXNlXG4gKi9cbmZ1bmN0aW9uIGdldFJlbW90ZUpzb24gKHVybCwgb3B0aW9ucykge1xuICB2YXIganNvbiA9IHJlbW90ZUNhY2hlW3VybF07XG4gIHZhciBhbGxUYXNrcyA9IFByb21pc2UucmVzb2x2ZSgpO1xuICB2YXIgc2NoZW1lID0gdXJsLmluZGV4T2YoJzonKSA9PT0gLTEgPyB1bmRlZmluZWQgOiB1cmwuc3BsaXQoJzonKVswXTtcblxuICBpZiAoIV8uaXNVbmRlZmluZWQoanNvbikpIHtcbiAgICBhbGxUYXNrcyA9IGFsbFRhc2tzLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIGpzb247XG4gICAgfSk7XG4gIH0gZWxzZSBpZiAoc3VwcG9ydGVkU2NoZW1lcy5pbmRleE9mKHNjaGVtZSkgPT09IC0xICYmICFfLmlzVW5kZWZpbmVkKHNjaGVtZSkpIHtcbiAgICBhbGxUYXNrcyA9IGFsbFRhc2tzLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignVW5zdXBwb3J0ZWQgcmVtb3RlIHJlZmVyZW5jZSBzY2hlbWU6ICcgKyBzY2hlbWUpKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBhbGxUYXNrcyA9IHBhdGhMb2FkZXIubG9hZCh1cmwsIG9wdGlvbnMpO1xuXG4gICAgaWYgKG9wdGlvbnMucHJvY2Vzc0NvbnRlbnQpIHtcbiAgICAgIGFsbFRhc2tzID0gYWxsVGFza3MudGhlbihmdW5jdGlvbiAoY29udGVudCkge1xuICAgICAgICByZXR1cm4gb3B0aW9ucy5wcm9jZXNzQ29udGVudChjb250ZW50LCB1cmwpO1xuICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFsbFRhc2tzID0gYWxsVGFza3MudGhlbihKU09OLnBhcnNlKTtcbiAgICB9XG5cbiAgICBhbGxUYXNrcy50aGVuKGZ1bmN0aW9uIChuSnNvbikge1xuICAgICAgcmVtb3RlQ2FjaGVbdXJsXSA9IG5Kc29uO1xuXG4gICAgICByZXR1cm4gbkpzb247XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gYWxsVGFza3M7XG59XG5cbi8qIEV4cG9ydGVkIEZ1bmN0aW9ucyAqL1xuXG4vKipcbiAqIENsZWFycyB0aGUgaW50ZXJuYWwgY2FjaGUgb2YgdXJsIC0+IEphdmFTY3JpcHQgb2JqZWN0IG1hcHBpbmdzIGJhc2VkIG9uIHByZXZpb3VzbHkgcmVzb2x2ZWQgcmVmZXJlbmNlcy5cbiAqL1xubW9kdWxlLmV4cG9ydHMuY2xlYXJDYWNoZSA9IGZ1bmN0aW9uIGNsZWFyQ2FjaGUgKCkge1xuICByZW1vdGVDYWNoZSA9IHt9O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHdoZXRoZXIgb3Igbm90IHRoZSBvYmplY3QgcmVwcmVzZW50cyBhIEpTT04gUmVmZXJlbmNlLlxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fHN0cmluZ30gW29ial0gLSBUaGUgb2JqZWN0IHRvIGNoZWNrXG4gKlxuICogQHJldHVybnMge2Jvb2xlYW59IHRydWUgaWYgdGhlIGFyZ3VtZW50IGlzIGFuIG9iamVjdCBhbmQgaXRzICRyZWYgcHJvcGVydHkgaXMgYSBzdHJpbmcgYW5kIGZhbHNlIG90aGVyd2lzZVxuICovXG52YXIgaXNKc29uUmVmZXJlbmNlID0gbW9kdWxlLmV4cG9ydHMuaXNKc29uUmVmZXJlbmNlID0gZnVuY3Rpb24gaXNKc29uUmVmZXJlbmNlIChvYmopIHtcbiAgLy8gVE9ETzogQWRkIGNoZWNrIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgSlNPTiBQb2ludGVyXG4gIHJldHVybiBfLmlzUGxhaW5PYmplY3Qob2JqKSAmJiBfLmlzU3RyaW5nKG9iai4kcmVmKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIG9yIG5vdCB0aGUgb2JqZWN0IHJlcHJlc2VudHMgYWxsT2YgYXJyYXlcbiAqXG4gKiBAcGFyYW0gIHtvYmplY3R9ICBvYmogLSBUaGUgb2JqZWN0IHRvIGNoZWNrXG4gKlxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgdGhlIGFyZ3VtZW50IGlzIGFuIG9iamVjdCBhbmQgaXQgaGFzIGFuIGFycmF5IHByb3BlcnR5IGFsbE9mXG4gKi9cbnZhciBpc0FsbE9mID0gbW9kdWxlLmV4cG9ydHMuaXNBbGxPZiA9IGZ1bmN0aW9uIGlzQWxsT2YgKG9iaikge1xuICByZXR1cm4gXy5pc1BsYWluT2JqZWN0KG9iaikgJiYgXy5pc0FycmF5KG9iai5hbGxPZik7XG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGFycmF5IG9mIHBhdGggc2VnbWVudHMgYW5kIGNyZWF0ZXMgYSBKU09OIFBvaW50ZXIgZnJvbSBpdC5cbiAqXG4gKiBAc2VlIHtAbGluayBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2OTAxfVxuICpcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGggLSBUaGUgcGF0aCBzZWdtZW50c1xuICpcbiAqIEByZXR1cm5zIHtzdHJpbmd9IEEgSlNPTiBQb2ludGVyIGJhc2VkIG9uIHRoZSBwYXRoIHNlZ21lbnRzXG4gKlxuICogQHRocm93cyBFcnJvciBpZiB0aGUgYXJndW1lbnRzIGFyZSBtaXNzaW5nIG9yIGludmFsaWRcbiAqL1xudmFyIHBhdGhUb1BvaW50ZXIgPSBtb2R1bGUuZXhwb3J0cy5wYXRoVG9Qb2ludGVyID0gZnVuY3Rpb24gcGF0aFRvUG9pbnRlciAocGF0aCkge1xuICBpZiAoXy5pc1VuZGVmaW5lZChwYXRoKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncGF0aCBpcyByZXF1aXJlZCcpO1xuICB9IGVsc2UgaWYgKCFfLmlzQXJyYXkocGF0aCkpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3BhdGggbXVzdCBiZSBhbiBhcnJheScpO1xuICB9XG5cbiAgdmFyIHB0ciA9ICcjJztcblxuICBpZiAocGF0aC5sZW5ndGggPiAwKSB7XG4gICAgcHRyICs9ICcvJyArIHBhdGgubWFwKGZ1bmN0aW9uIChwYXJ0KSB7XG4gICAgICByZXR1cm4gcGFydC5yZXBsYWNlKC9+L2csICd+MCcpLnJlcGxhY2UoL1xcLy9nLCAnfjEnKTtcbiAgICB9KS5qb2luKCcvJyk7XG4gIH1cblxuICByZXR1cm4gcHRyO1xufTtcblxuLyoqXG4gKiBGaW5kIGFsbCBKU09OIFJlZmVyZW5jZXMgaW4gdGhlIGRvY3VtZW50LlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL2RyYWZ0LXBicnlhbi16eXAtanNvbi1yZWYtMDMjc2VjdGlvbi0zfVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBqc29uIC0gVGhlIEpTT04gZG9jdW1lbnQgdG8gZmluZCByZWZlcmVuY2VzIGluXG4gKlxuICogQHJldHVybnMge29iamVjdH0gQW4gb2JqZWN0IHdob3NlIGtleXMgYXJlIEpTT04gUG9pbnRlcnMgdG8gdGhlICckcmVmJyBub2RlIG9mIHRoZSBKU09OIFJlZmVyZW5jZVxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBhcmUgbWlzc2luZyBvciBpbnZhbGlkXG4gKi9cbnZhciBmaW5kUmVmcyA9IG1vZHVsZS5leHBvcnRzLmZpbmRSZWZzID0gZnVuY3Rpb24gZmluZFJlZnMgKGpzb24pIHtcbiAgaWYgKF8uaXNVbmRlZmluZWQoanNvbikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2pzb24gaXMgcmVxdWlyZWQnKTtcbiAgfSBlbHNlIGlmICghXy5pc1BsYWluT2JqZWN0KGpzb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdqc29uIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICByZXR1cm4gdHJhdmVyc2UoanNvbikucmVkdWNlKGZ1bmN0aW9uIChhY2MpIHtcbiAgICB2YXIgdmFsID0gdGhpcy5ub2RlO1xuXG4gICAgaWYgKHRoaXMua2V5ID09PSAnJHJlZicgJiYgaXNKc29uUmVmZXJlbmNlKHRoaXMucGFyZW50Lm5vZGUpKSB7XG4gICAgICBhY2NbcGF0aFRvUG9pbnRlcih0aGlzLnBhdGgpXSA9IHZhbDtcbiAgICB9XG5cbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG59O1xuXG52YXIgZmluZEFsbE9mcyA9IG1vZHVsZS5leHBvcnRzLmZpbmRBbGxPZnMgPSBmdW5jdGlvbiBmaW5kQWxsT2ZzIChqc29uKSB7XG4gIGlmIChfLmlzVW5kZWZpbmVkKGpzb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdqc29uIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChqc29uKSkge1xuICAgIHRocm93IG5ldyBFcnJvcignanNvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICB9XG5cbiAgcmV0dXJuIHRyYXZlcnNlKGpzb24pLnJlZHVjZShmdW5jdGlvbiAoYWNjKSB7XG4gICAgdmFyIHZhbCA9IHRoaXMubm9kZTtcblxuICAgIGlmICh0aGlzLmtleSA9PT0gJ2FsbE9mJyAmJiBpc0FsbE9mKHRoaXMucGFyZW50Lm5vZGUpKSB7XG4gICAgICBhY2NbcGF0aFRvUG9pbnRlcih0aGlzLnBhdGgpXSA9IHZhbDtcbiAgICB9XG5cbiAgICByZXR1cm4gYWNjO1xuICB9LCB7fSk7XG59O1xuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciBvciBub3QgdGhlIEpTT04gUG9pbnRlciBpcyBhIHJlbW90ZSByZWZlcmVuY2UuXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHB0ciAtIFRoZSBKU09OIFBvaW50ZXJcbiAqXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gdHJ1ZSBpZiB0aGUgSlNPTiBQb2ludGVyIGlzIHJlbW90ZSBvciBmYWxzZSBpZiBub3RcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBhcmd1bWVudHMgYXJlIG1pc3Npbmcgb3IgaW52YWxpZFxuICovXG52YXIgaXNSZW1vdGVQb2ludGVyID0gbW9kdWxlLmV4cG9ydHMuaXNSZW1vdGVQb2ludGVyID0gZnVuY3Rpb24gaXNSZW1vdGVQb2ludGVyIChwdHIpIHtcbiAgaWYgKF8uaXNVbmRlZmluZWQocHRyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHRyIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNTdHJpbmcocHRyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHRyIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgfVxuXG4gIC8vIFdlIHRyZWF0IGFueXRoaW5nIG90aGVyIHRoYW4gbG9jYWwsIHZhbGlkIEpTT04gUG9pbnRlciB2YWx1ZXMgYXMgcmVtb3RlXG4gIHJldHVybiBwdHIgIT09ICcnICYmIHB0ci5jaGFyQXQoMCkgIT09ICcjJztcbn07XG5cbi8qKlxuICogVGFrZXMgYSBKU09OIFJlZmVyZW5jZSBhbmQgcmV0dXJucyBhbiBhcnJheSBvZiBwYXRoIHNlZ21lbnRzLlxuICpcbiAqIEBzZWUge0BsaW5rIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzY5MDF9XG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHB0ciAtIFRoZSBKU09OIFBvaW50ZXIgZm9yIHRoZSBKU09OIFJlZmVyZW5jZVxuICpcbiAqIEByZXR1cm5zIHtzdHJpbmdbXX0gQW4gYXJyYXkgb2YgcGF0aCBzZWdtZW50cyBvciB0aGUgcGFzc2VkIGluIHN0cmluZyBpZiBpdCBpcyBhIHJlbW90ZSByZWZlcmVuY2VcbiAqXG4gKiBAdGhyb3dzIEVycm9yIGlmIHRoZSBhcmd1bWVudHMgYXJlIG1pc3Npbmcgb3IgaW52YWxpZFxuICovXG52YXIgcGF0aEZyb21Qb2ludGVyID0gbW9kdWxlLmV4cG9ydHMucGF0aEZyb21Qb2ludGVyID0gZnVuY3Rpb24gcGF0aEZyb21Qb2ludGVyIChwdHIpIHtcbiAgaWYgKF8uaXNVbmRlZmluZWQocHRyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHRyIGlzIHJlcXVpcmVkJyk7XG4gIH0gZWxzZSBpZiAoIV8uaXNTdHJpbmcocHRyKSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHRyIG11c3QgYmUgYSBzdHJpbmcnKTtcbiAgfVxuXG4gIHZhciBwYXRoID0gW107XG4gIHZhciByb290UGF0aHMgPSBbJycsICcjJywgJyMvJ107XG5cbiAgaWYgKGlzUmVtb3RlUG9pbnRlcihwdHIpKSB7XG4gICAgcGF0aCA9IHB0cjtcbiAgfSBlbHNlIHtcbiAgICBpZiAocm9vdFBhdGhzLmluZGV4T2YocHRyKSA9PT0gLTEgJiYgcHRyLmNoYXJBdCgwKSA9PT0gJyMnKSB7XG4gICAgICBwYXRoID0gcHRyLnN1YnN0cmluZyhwdHIuaW5kZXhPZignLycpKS5zcGxpdCgnLycpLnJlZHVjZShmdW5jdGlvbiAocGFydHMsIHBhcnQpIHtcbiAgICAgICAgaWYgKHBhcnQgIT09ICcnKSB7XG4gICAgICAgICAgcGFydHMucHVzaChwYXJ0LnJlcGxhY2UoL34wL2csICd+JykucmVwbGFjZSgvfjEvZywgJy8nKSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcGFydHM7XG4gICAgICB9LCBbXSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhdGg7XG59O1xuXG5mdW5jdGlvbiBjb21iaW5lUmVmcyAoYmFzZSwgcmVmKSB7XG4gIHZhciBiYXNlUGF0aCA9IHBhdGhGcm9tUG9pbnRlcihiYXNlKTtcblxuICBpZiAoaXNSZW1vdGVQb2ludGVyKHJlZikpIHtcbiAgICBpZiAocmVmLmluZGV4T2YoJyMnKSA9PT0gLTEpIHtcbiAgICAgIHJlZiA9ICcjJztcbiAgICB9IGVsc2Uge1xuICAgICAgcmVmID0gcmVmLnN1YnN0cmluZyhyZWYuaW5kZXhPZignIycpKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGF0aFRvUG9pbnRlcihiYXNlUGF0aC5jb25jYXQocGF0aEZyb21Qb2ludGVyKHJlZikpKS5yZXBsYWNlKC9cXC9cXCRyZWYvZywgJycpO1xufVxuXG5mdW5jdGlvbiBjb21wdXRlVXJsIChiYXNlLCByZWYpIHtcbiAgdmFyIGlzUmVsYXRpdmUgPSByZWYuY2hhckF0KDApICE9PSAnIycgJiYgcmVmLmluZGV4T2YoJzonKSA9PT0gLTE7XG4gIHZhciBuZXdMb2NhdGlvbiA9IFtdO1xuICB2YXIgcmVmU2VnbWVudHMgPSAocmVmLmluZGV4T2YoJyMnKSA+IC0xID8gcmVmLnNwbGl0KCcjJylbMF0gOiByZWYpLnNwbGl0KCcvJyk7XG5cbiAgZnVuY3Rpb24gc2VnbWVudEhhbmRsZXIgKHNlZ21lbnQpIHtcbiAgICBpZiAoc2VnbWVudCA9PT0gJy4uJykge1xuICAgICAgbmV3TG9jYXRpb24ucG9wKCk7XG4gICAgfSBlbHNlIGlmIChzZWdtZW50ICE9PSAnLicpIHtcbiAgICAgIG5ld0xvY2F0aW9uLnB1c2goc2VnbWVudCk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVtb3ZlIHRyYWlsaW5nIHNsYXNoXG4gIGlmIChiYXNlICYmIGJhc2UubGVuZ3RoID4gMSAmJiBiYXNlW2Jhc2UubGVuZ3RoIC0gMV0gPT09ICcvJykge1xuICAgIGJhc2UgPSBiYXNlLnN1YnN0cmluZygwLCBiYXNlLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBiYXNlICh3aGVuIGF2YWlsYWJsZSlcbiAgaWYgKGJhc2UpIHtcbiAgICBiYXNlLnNwbGl0KCcjJylbMF0uc3BsaXQoJy8nKS5mb3JFYWNoKHNlZ21lbnRIYW5kbGVyKTtcbiAgfVxuXG4gIGlmIChpc1JlbGF0aXZlKSB7XG4gICAgLy8gQWRkIHJlZmVyZW5jZSBzZWdtZW50c1xuICAgIHJlZlNlZ21lbnRzLmZvckVhY2goc2VnbWVudEhhbmRsZXIpO1xuICB9IGVsc2Uge1xuICAgIG5ld0xvY2F0aW9uID0gcmVmU2VnbWVudHM7XG4gIH1cblxuICByZXR1cm4gbmV3TG9jYXRpb24uam9pbignLycpO1xufVxuXG5mdW5jdGlvbiByZWFsUmVzb2x2ZVJlZnMgKGpzb24sIG9wdGlvbnMsIG1ldGFkYXRhKSB7XG4gIHZhciBkZXB0aCA9IF8uaXNVbmRlZmluZWQob3B0aW9ucy5kZXB0aCkgPyAxIDogb3B0aW9ucy5kZXB0aDtcbiAgdmFyIGpzb25UID0gdHJhdmVyc2UoanNvbik7XG4gIHZhciBhbGxPZnM7XG5cbiAgZnVuY3Rpb24gZmluZFBhcmVudFJlZmVyZW5jZSAocGF0aCkge1xuICAgIHZhciBwUGF0aCA9IHBhdGguc2xpY2UoMCwgcGF0aC5sYXN0SW5kZXhPZignYWxsT2YnKSk7XG4gICAgdmFyIHJlZk1ldGFkYXRhID0gbWV0YWRhdGFbcGF0aFRvUG9pbnRlcihwUGF0aCldO1xuXG4gICAgaWYgKCFfLmlzVW5kZWZpbmVkKHJlZk1ldGFkYXRhKSkge1xuICAgICAgcmV0dXJuIHBhdGhUb1BvaW50ZXIocFBhdGgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocFBhdGguaW5kZXhPZignYWxsT2YnKSA+IC0xKSB7XG4gICAgICAgIHJldHVybiBmaW5kUGFyZW50UmVmZXJlbmNlKHBQYXRoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZml4Q2lyY3VsYXJzIChySnNvblQpIHtcbiAgICB2YXIgY2lyY3VsYXJQdHJzID0gW107XG4gICAgdmFyIHNjcnViYmVkID0gckpzb25ULm1hcChmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgcHRyID0gcGF0aFRvUG9pbnRlcih0aGlzLnBhdGgpO1xuICAgICAgdmFyIHJlZk1ldGFkYXRhID0gbWV0YWRhdGFbcHRyXTtcbiAgICAgIHZhciBwUHRyO1xuXG4gICAgICBpZiAodGhpcy5jaXJjdWxhcikge1xuICAgICAgICBjaXJjdWxhclB0cnMucHVzaChwdHIpO1xuXG4gICAgICAgIGlmIChfLmlzVW5kZWZpbmVkKHJlZk1ldGFkYXRhKSkge1xuICAgICAgICAgIC8vIFRoaXMgbXVzdCBiZSBjaXJjdWxhciBjb21wb3NpdGlvbi9pbmhlcml0YW5jZVxuICAgICAgICAgIHBQdHIgPSBmaW5kUGFyZW50UmVmZXJlbmNlKHRoaXMucGF0aCk7XG4gICAgICAgICAgcmVmTWV0YWRhdGEgPSBtZXRhZGF0YVtwUHRyXTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFJlZmVyZW5jZSBtZXRhZGF0YSBjYW4gYmUgdW5kZWZpbmVkIGZvciByZWZlcmVuY2VzIHRvIHNjaGVtYXMgdGhhdCBoYXZlIGNpcmN1bGFyIGNvbXBvc2l0aW9uL2luaGVyaXRhbmNlIGFuZFxuICAgICAgICAvLyBhcmUgc2FmZWx5IGlnbm9yZWFibGUuXG4gICAgICAgIGlmICghXy5pc1VuZGVmaW5lZChyZWZNZXRhZGF0YSkpIHtcbiAgICAgICAgICByZWZNZXRhZGF0YS5jaXJjdWxhciA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZGVwdGggPT09IDApIHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZSh7fSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy51cGRhdGUodHJhdmVyc2UodGhpcy5ub2RlKS5tYXAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuY2lyY3VsYXIpIHtcbiAgICAgICAgICAgICAgdGhpcy5wYXJlbnQudXBkYXRlKHt9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFJlcGxhY2Ugc2NydWJiZWQgY2lyY3VsYXJzIGJhc2VkIG9uIGRlcHRoXG4gICAgXy5lYWNoKGNpcmN1bGFyUHRycywgZnVuY3Rpb24gKHB0cikge1xuICAgICAgdmFyIGRlcHRoUGF0aCA9IFtdO1xuICAgICAgdmFyIHBhdGggPSBwYXRoRnJvbVBvaW50ZXIocHRyKTtcbiAgICAgIHZhciB2YWx1ZSA9IHRyYXZlcnNlKHNjcnViYmVkKS5nZXQocGF0aCk7XG4gICAgICB2YXIgaTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IGRlcHRoOyBpKyspIHtcbiAgICAgICAgZGVwdGhQYXRoLnB1c2guYXBwbHkoZGVwdGhQYXRoLCBwYXRoKTtcblxuICAgICAgICB0cmF2ZXJzZShzY3J1YmJlZCkuc2V0KGRlcHRoUGF0aCwgXy5jbG9uZURlZXAodmFsdWUpKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBzY3J1YmJlZDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHJlcGxhY2VBbGxPZiAoYWxsT2YsIGFsbE9mUHRyKSB7XG4gICAgdmFyIGxvY2FsUGF0aCA9IHBhdGhGcm9tUG9pbnRlcihhbGxPZlB0cik7XG4gICAgdmFyIHZhbHVlID0ganNvblQuZ2V0KGxvY2FsUGF0aCk7XG4gICAgdmFyIGFsbE9mUHRyUGF0aCA9IHBhdGhGcm9tUG9pbnRlcihhbGxPZlB0cik7XG4gICAgdmFyIHBhcmVudFBhdGggPSBhbGxPZlB0clBhdGguc2xpY2UoMCwgYWxsT2ZQdHJQYXRoLmxlbmd0aCAtIDEpO1xuXG4gICAgdmFyIHNvdXJjZSA9IGpzb25ULmdldChwYXJlbnRQYXRoKTtcblxuICAgIGlmICghc291cmNlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgb3B0aW9ucy5jb2xsYXBzZUFsbE9mLmFwcGx5KHNvdXJjZSwgdmFsdWUpO1xuICAgIGRlbGV0ZSBzb3VyY2UuYWxsT2Y7XG4gIH1cblxuICBmdW5jdGlvbiByZXBsYWNlUmVmZXJlbmNlIChyZWYsIHJlZlB0cikge1xuICAgIHZhciByZWZNZXRhZGF0YUtleSA9IGNvbWJpbmVSZWZzKHJlZlB0ciwgJyMnKTtcbiAgICB2YXIgbG9jYWxSZWYgPSByZWYgPSByZWYuaW5kZXhPZignIycpID09PSAtMSA/XG4gICAgICAgICAgJyMnIDpcbiAgICAgICAgICByZWYuc3Vic3RyaW5nKHJlZi5pbmRleE9mKCcjJykpO1xuICAgIHZhciBsb2NhbFBhdGggPSBwYXRoRnJvbVBvaW50ZXIobG9jYWxSZWYpO1xuICAgIHZhciBtaXNzaW5nID0gIWpzb25ULmhhcyhsb2NhbFBhdGgpO1xuICAgIHZhciB2YWx1ZSA9IGpzb25ULmdldChsb2NhbFBhdGgpO1xuICAgIHZhciByZWZQdHJQYXRoID0gcGF0aEZyb21Qb2ludGVyKHJlZlB0cik7XG4gICAgdmFyIHBhcmVudFBhdGggPSByZWZQdHJQYXRoLnNsaWNlKDAsIHJlZlB0clBhdGgubGVuZ3RoIC0gMSk7XG4gICAgdmFyIHJlZk1ldGFkYXRhID0gbWV0YWRhdGFbcmVmTWV0YWRhdGFLZXldIHx8IHtcbiAgICAgIHJlZjogcmVmXG4gICAgfTtcblxuICAgIGlmICghbWlzc2luZykge1xuICAgICAgaWYgKHBhcmVudFBhdGgubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIC8vIFNlbGYgcmVmZXJlbmNlcyBhcmUgc3BlY2lhbFxuICAgICAgICBpZiAoanNvblQudmFsdWUgPT09IHZhbHVlKSB7XG4gICAgICAgICAgdmFsdWUgPSB7fTtcblxuICAgICAgICAgIHJlZk1ldGFkYXRhLmNpcmN1bGFyID0gdHJ1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGpzb25ULnZhbHVlID0gdmFsdWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoanNvblQuZ2V0KHBhcmVudFBhdGgpID09PSB2YWx1ZSkge1xuICAgICAgICAgIHZhbHVlID0ge307XG5cbiAgICAgICAgICByZWZNZXRhZGF0YS5jaXJjdWxhciA9IHRydWU7XG4gICAgICAgIH1cblxuICAgICAgICBqc29uVC5zZXQocGFyZW50UGF0aCwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZWZNZXRhZGF0YS5taXNzaW5nID0gdHJ1ZTtcbiAgICB9XG5cbiAgICBtZXRhZGF0YVtyZWZNZXRhZGF0YUtleV0gPSByZWZNZXRhZGF0YTtcbiAgfVxuXG4gIC8vIEFsbCByZWZlcmVuY2VzIGF0IHRoaXMgcG9pbnQgc2hvdWxkIGJlIGxvY2FsIGV4Y2VwdCBtaXNzaW5nL2ludmFsaWQgcmVmZXJlbmNlc1xuICBfLmVhY2goZmluZFJlZnMoanNvbiksIGZ1bmN0aW9uIChyZWYsIHJlZlB0cikge1xuICAgIGlmICghaXNSZW1vdGVQb2ludGVyKHJlZikpIHtcbiAgICAgIHJlcGxhY2VSZWZlcmVuY2UocmVmLCByZWZQdHIpO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKG9wdGlvbnMuY29sbGFwc2VBbGxPZikge1xuICAgIC8vIE5lc3RlZCBhbGxvZnMgbXVzdCBiZSBoYW5kbGVkIGluIHJldmVyc2Ugb3JkZXJcbiAgICAvLyBzbyB3ZSBtYWtlIGFuIGFycmF5IGFuZCByZXZlcnNlIGl0IHRvIGdldCBvdXJcbiAgICAvLyBvcmRlciBvZiBvcGVyYXRpb25zXG4gICAgYWxsT2ZzID0gZmluZEFsbE9mcyhqc29uKTtcbiAgICBPYmplY3Qua2V5cyhhbGxPZnMpLnJldmVyc2UoKS5tYXAoZnVuY3Rpb24gKGtleSkge1xuICAgICAgcmVwbGFjZUFsbE9mKGFsbE9mc1trZXldLCBrZXkpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlIGZ1bGwgbG9jYXRpb25zIGZyb20gcmVmZXJlbmNlIG1ldGFkYXRhXG4gIGlmICghXy5pc1VuZGVmaW5lZChvcHRpb25zLmxvY2F0aW9uKSkge1xuICAgIF8uZWFjaChtZXRhZGF0YSwgZnVuY3Rpb24gKHJlZk1ldGFkYXRhKSB7XG4gICAgICB2YXIgbm9ybWFsaXplZFB0ciA9IHJlZk1ldGFkYXRhLnJlZjtcblxuICAgICAgLy8gUmVtb3ZlIHRoZSBiYXNlXG4gICAgICBub3JtYWxpemVkUHRyID0gbm9ybWFsaXplZFB0ci5yZXBsYWNlKG9wdGlvbnMubG9jYXRpb24sICcnKTtcblxuICAgICAgLy8gUmVtb3ZlIHRoZSAvIHByZWZpeFxuICAgICAgaWYgKG5vcm1hbGl6ZWRQdHIuY2hhckF0KDApID09PSAnLycpIHtcbiAgICAgICAgbm9ybWFsaXplZFB0ciA9IG5vcm1hbGl6ZWRQdHIuc3Vic3RyaW5nKDEpO1xuICAgICAgfVxuXG4gICAgICByZWZNZXRhZGF0YS5yZWYgPSBub3JtYWxpemVkUHRyO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gRml4IGNpcmN1bGFyc1xuICByZXR1cm4ge1xuICAgIG1ldGFkYXRhOiBtZXRhZGF0YSxcbiAgICByZXNvbHZlZDogZml4Q2lyY3VsYXJzKGpzb25UKVxuICB9O1xufVxuXG5mdW5jdGlvbiByZXNvbHZlUmVtb3RlUmVmcyAoanNvbiwgb3B0aW9ucywgcGFyZW50UHRyLCBwYXJlbnRzLCBtZXRhZGF0YSkge1xuICB2YXIgYWxsVGFza3MgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgdmFyIGpzb25UID0gdHJhdmVyc2UoanNvbik7XG5cbiAgZnVuY3Rpb24gcmVwbGFjZVJlbW90ZVJlZiAocmVmUHRyLCBwdHIsIHJlbW90ZUxvY2F0aW9uLCByZW1vdGVQdHIsIHJlc29sdmVkKSB7XG4gICAgdmFyIG5vcm1hbGl6ZWRQdHIgPSByZW1vdGVMb2NhdGlvbiArIChyZW1vdGVQdHIgPT09ICcjJyA/ICcnIDogcmVtb3RlUHRyKTtcbiAgICB2YXIgcmVmTWV0YWRhdGFLZXkgPSBjb21iaW5lUmVmcyhwYXJlbnRQdHIsIHJlZlB0cik7XG4gICAgdmFyIHJlZk1ldGFkYXRhID0gbWV0YWRhdGFbcmVmTWV0YWRhdGFLZXldIHx8IHt9O1xuICAgIHZhciByZWZQYXRoID0gcGF0aEZyb21Qb2ludGVyKHJlZlB0cik7XG4gICAgdmFyIHZhbHVlO1xuXG5cbiAgICBpZiAoXy5pc1VuZGVmaW5lZChyZXNvbHZlZCkpIHtcbiAgICAgIHJlZk1ldGFkYXRhLmNpcmN1bGFyID0gdHJ1ZTtcblxuICAgICAgLy8gVXNlIHRoZSBwYXJlbnQgcmVmZXJlbmNlIGxvb2NhdGlvblxuICAgICAgdmFsdWUgPSBwYXJlbnRzW3JlbW90ZUxvY2F0aW9uXS5yZWY7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEdldCB0aGUgcmVtb3RlIHZhbHVlXG4gICAgICB2YWx1ZSA9IHRyYXZlcnNlKHJlc29sdmVkKS5nZXQocGF0aEZyb21Qb2ludGVyKHJlbW90ZVB0cikpO1xuXG4gICAgICAvLyBJZiB0aGUgcmVtb3RlIHZhbHVlIGlzIGl0c2VsZiBhIHJlZmVyZW5jZSwgdXBkYXRlIHRoZSByZWZlcmVuY2UgdG8gYmUgcmVwbGFjZWQgd2l0aCBpdHMgcmVmZXJlbmNlIHZhbHVlLlxuICAgICAgLy8gT3RoZXJ3aXNlLCByZXBsYWNlIHRoZSByZW1vdGUgcmVmZXJlbmNlLlxuICAgICAgaWYgKHZhbHVlLiRyZWYpIHtcbiAgICAgICAgdmFsdWUgPSB2YWx1ZS4kcmVmO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVmUGF0aC5wb3AoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBDb2xsYXBzZSBzZWxmIHJlZmVyZW5jZXNcbiAgICBpZiAocmVmUGF0aC5sZW5ndGggPT09IDApIHtcbiAgICAgIGpzb25ULnZhbHVlID0gdmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGpzb25ULnNldChyZWZQYXRoLCB2YWx1ZSk7XG4gICAgfVxuXG4gICAgcmVmTWV0YWRhdGEucmVmID0gbm9ybWFsaXplZFB0cjtcblxuICAgIG1ldGFkYXRhW3JlZk1ldGFkYXRhS2V5XSA9IHJlZk1ldGFkYXRhO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZXIgKCkge1xuICAgIHJldHVybiB7XG4gICAgICBtZXRhZGF0YTogbWV0YWRhdGEsXG4gICAgICByZXNvbHZlZDoganNvblQudmFsdWVcbiAgICB9O1xuICB9XG5cbiAgXy5lYWNoKGZpbmRSZWZzKGpzb24pLCBmdW5jdGlvbiAocHRyLCByZWZQdHIpIHtcbiAgICBpZiAoaXNSZW1vdGVQb2ludGVyKHB0cikpIHtcbiAgICAgIGFsbFRhc2tzID0gYWxsVGFza3MudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciByZW1vdGVMb2NhdGlvbiA9IGNvbXB1dGVVcmwob3B0aW9ucy5sb2NhdGlvbiwgcHRyKTtcbiAgICAgICAgdmFyIHJlZlBhcnRzID0gcHRyLnNwbGl0KCcjJyk7XG4gICAgICAgIHZhciBoYXNoID0gJyMnICsgKHJlZlBhcnRzWzFdIHx8ICcnKTtcblxuICAgICAgICBpZiAoXy5pc1VuZGVmaW5lZChwYXJlbnRzW3JlbW90ZUxvY2F0aW9uXSkpIHtcbiAgICAgICAgICByZXR1cm4gZ2V0UmVtb3RlSnNvbihyZW1vdGVMb2NhdGlvbiwgb3B0aW9ucylcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChyZW1vdGVKc29uKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZW1vdGVKc29uO1xuICAgICAgICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICAgICAgICByZXR1cm4gZXJyO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgICAgICAgICB2YXIgcmVmQmFzZSA9IHJlZlBhcnRzWzBdO1xuICAgICAgICAgICAgICB2YXIgck9wdGlvbnMgPSBfLmNsb25lRGVlcChvcHRpb25zKTtcbiAgICAgICAgICAgICAgdmFyIG5ld1BhcmVudFB0ciA9IGNvbWJpbmVSZWZzKHBhcmVudFB0ciwgcmVmUHRyKTtcblxuICAgICAgICAgICAgICAvLyBSZW1vdmUgdGhlIGxhc3QgcGF0aCBzZWdtZW50XG4gICAgICAgICAgICAgIHJlZkJhc2UgPSByZWZCYXNlLnN1YnN0cmluZygwLCByZWZCYXNlLmxhc3RJbmRleE9mKCcvJykgKyAxKTtcblxuICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIHJlY3Vyc2l2ZSBsb2NhdGlvblxuICAgICAgICAgICAgICByT3B0aW9ucy5sb2NhdGlvbiA9IGNvbXB1dGVVcmwob3B0aW9ucy5sb2NhdGlvbiwgcmVmQmFzZSk7XG5cbiAgICAgICAgICAgICAgLy8gUmVjb3JkIHRoZSBwYXJlbnRcbiAgICAgICAgICAgICAgcGFyZW50c1tyZW1vdGVMb2NhdGlvbl0gPSB7XG4gICAgICAgICAgICAgICAgcmVmOiBwYXJlbnRQdHJcbiAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICBpZiAoXy5pc0Vycm9yKHJlc3BvbnNlKSkge1xuICAgICAgICAgICAgICAgIG1ldGFkYXRhW25ld1BhcmVudFB0cl0gPSB7XG4gICAgICAgICAgICAgICAgICBlcnI6IHJlc3BvbnNlLFxuICAgICAgICAgICAgICAgICAgbWlzc2luZzogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgIHJlZjogcHRyXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBSZXNvbHZlIHJlbW90ZSByZWZlcmVuY2VzXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc29sdmVSZW1vdGVSZWZzKHJlc3BvbnNlLCByT3B0aW9ucywgbmV3UGFyZW50UHRyLCBwYXJlbnRzLCBtZXRhZGF0YSlcbiAgICAgICAgICAgICAgICAgIC50aGVuKGZ1bmN0aW9uIChyTWV0YWRhdGEpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHBhcmVudHNbcmVtb3RlTG9jYXRpb25dO1xuXG4gICAgICAgICAgICAgICAgICAgIHJlcGxhY2VSZW1vdGVSZWYocmVmUHRyLCBwdHIsIHJlbW90ZUxvY2F0aW9uLCBoYXNoLCByTWV0YWRhdGEucmVzb2x2ZWQpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFRoaXMgaXMgYSBjaXJjdWxhciByZWZlcmVuY2VcbiAgICAgICAgICByZXBsYWNlUmVtb3RlUmVmKHJlZlB0ciwgcHRyLCByZW1vdGVMb2NhdGlvbiwgaGFzaCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgYWxsVGFza3MgPSBhbGxUYXNrcy50aGVuKHJlc29sdmVyLCByZXNvbHZlcik7XG5cbiAgcmV0dXJuIGFsbFRhc2tzO1xufVxuXG4vKipcbiAqIFRha2VzIGEgSlNPTiBkb2N1bWVudCwgcmVzb2x2ZXMgYWxsIEpTT04gUmVmZXJlbmNlcyBhbmQgcmV0dXJucyBhIGZ1bGx5IHJlc29sdmVkIGVxdWl2YWxlbnQgYWxvbmcgd2l0aCByZWZlcmVuY2VcbiAqIHJlc29sdXRpb24gbWV0YWRhdGEuXG4gKlxuICogKipJbXBvcnRhbnQgRGV0YWlscyoqXG4gKlxuICogKiBUaGUgaW5wdXQgYXJndW1lbnRzIGFyZSBuZXZlciBhbHRlcmVkXG4gKiAqIFdoZW4gdXNpbmcgcHJvbWlzZXMsIG9ubHkgb25lIHZhbHVlIGNhbiBiZSByZXNvbHZlZCBzbyBpdCBpcyBhbiBvYmplY3Qgd2hvc2Uga2V5cyBhbmQgdmFsdWVzIGFyZSB0aGUgc2FtZSBuYW1lIGFuZFxuICogICB2YWx1ZSBhcyBhcmd1bWVudHMgMSBhbmQgMiBmb3Ige0BsaW5rIHJlc3VsdENhbGxiYWNrfVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBqc29uIC0gVGhlIEpTT04gIGRvY3VtZW50IGhhdmluZyB6ZXJvIG9yIG1vcmUgSlNPTiBSZWZlcmVuY2VzXG4gKiBAcGFyYW0ge29iamVjdH0gW29wdGlvbnNdIC0gVGhlIG9wdGlvbnMgKEFsbCBvcHRpb25zIGFyZSBwYXNzZWQgZG93biB0byB3aGl0bG9ja2pjL3BhdGgtbG9hZGVyKVxuICogQHBhcmFtIHtudW1iZXJ9IFtvcHRpb25zLmRlcHRoPTFdIC0gVGhlIGRlcHRoIHRvIHJlc29sdmUgY2lyY3VsYXIgcmVmZXJlbmNlc1xuICogQHBhcmFtIHtzdHJpbmd9IFtvcHRpb25zLmxvY2F0aW9uXSAtIFRoZSBsb2NhdGlvbiB0byB3aGljaCByZWxhdGl2ZSByZWZlcmVuY2VzIHNob3VsZCBiZSByZXNvbHZlZFxuICogQHBhcmFtIHtwcmVwYXJlUmVxdWVzdENhbGxiYWNrfSBbb3B0aW9ucy5wcmVwYXJlUmVxdWVzdF0gLSBUaGUgY2FsbGJhY2sgdXNlZCB0byBwcmVwYXJlIGFuIEhUVFAgcmVxdWVzdFxuICogQHBhcmFtIHtwcm9jZXNzQ29udGVudENhbGxiYWNrfSBbb3B0aW9ucy5wcm9jZXNzQ29udGVudF0gLSBUaGUgY2FsbGJhY2sgdXNlZCB0byBwcm9jZXNzIGEgcmVmZXJlbmNlJ3MgY29udGVudFxuICogQHBhcmFtIHtyZXN1bHRDYWxsYmFja30gW2RvbmVdIC0gVGhlIHJlc3VsdCBjYWxsYmFja1xuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgdGhlIGFyZ3VtZW50cyBhcmUgbWlzc2luZyBvciBpbnZhbGlkXG4gKlxuICogQHJldHVybnMge1Byb21pc2V9IFRoZSBwcm9taXNlLlxuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBFeGFtcGxlIHVzaW5nIGNhbGxiYWNrc1xuICpcbiAqIEpzb25SZWZzLnJlc29sdmVSZWZzKHtcbiAqICAgbmFtZTogJ2pzb24tcmVmcycsXG4gKiAgIG93bmVyOiB7XG4gKiAgICAgJHJlZjogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3Mvd2hpdGxvY2tqYy9qc29uLXJlZnMjL293bmVyJ1xuICogICB9XG4gKiB9LCBmdW5jdGlvbiAoZXJyLCByZXNvbHZlZCwgbWV0YWRhdGEpIHtcbiAqICAgaWYgKGVycikgdGhyb3cgZXJyO1xuICpcbiAqICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkocmVzb2x2ZWQpKTsgLy8ge25hbWU6ICdqc29uLXJlZnMnLCBvd25lcjogeyAuLi4gfX1cbiAqICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkobWV0YWRhdGEpKTsgLy8geycjL293bmVyJzoge3JlZjogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3Mvd2hpdGxvY2tqYy9qc29uLXJlZnMjL293bmVyJ319XG4gKiB9KTtcbiAqXG4gKiBAZXhhbXBsZVxuICogLy8gRXhhbXBsZSB1c2luZyBwcm9taXNlc1xuICpcbiAqIEpzb25SZWZzLnJlc29sdmVSZWZzKHtcbiAqICAgbmFtZTogJ2pzb24tcmVmcycsXG4gKiAgIG93bmVyOiB7XG4gKiAgICAgJHJlZjogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3Mvd2hpdGxvY2tqYy9qc29uLXJlZnMjL293bmVyJ1xuICogICB9XG4gKiB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gKiAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHJlc3VsdHMucmVzb2x2ZWQpKTsgLy8ge25hbWU6ICdqc29uLXJlZnMnLCBvd25lcjogeyAuLi4gfX1cbiAqICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkocmVzdWx0cy5tZXRhZGF0YSkpOyAvLyB7JyMvb3duZXInOiB7cmVmOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy93aGl0bG9ja2pjL2pzb24tcmVmcyMvb3duZXInfX1cbiAqIH0pO1xuICpcbiAqIEBleGFtcGxlXG4gKiAvLyBFeGFtcGxlIHVzaW5nIG9wdGlvbnMucHJlcGFyZVJlcXVlc3QgKHRvIGFkZCBhdXRoZW50aWNhdGlvbiBjcmVkZW50aWFscykgYW5kIG9wdGlvbnMucHJvY2Vzc0NvbnRlbnQgKHRvIHByb2Nlc3MgWUFNTClcbiAqXG4gKiBKc29uUmVmcy5yZXNvbHZlUmVmcyh7XG4gKiAgIG5hbWU6ICdqc29uLXJlZnMnLFxuICogICBvd25lcjoge1xuICogICAgICRyZWY6ICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL3doaXRsb2NramMvanNvbi1yZWZzIy9vd25lcidcbiAqICAgfVxuICogfSwge1xuICogICBwcmVwYXJlUmVxdWVzdDogZnVuY3Rpb24gKHJlcSkge1xuICogICAgIC8vIEFkZCB0aGUgJ0Jhc2ljIEF1dGhlbnRpY2F0aW9uJyBjcmVkZW50aWFsc1xuICogICAgIHJlcS5hdXRoKCd3aGl0bG9ja2pjJywgJ01ZX0dJVEhVQl9QQVNTV09SRCcpO1xuICpcbiAqICAgICAvLyBBZGQgdGhlICdYLUFQSS1LZXknIGhlYWRlciBmb3IgYW4gQVBJIEtleSBiYXNlZCBhdXRoZW50aWNhdGlvblxuICogICAgIC8vIHJlcS5zZXQoJ1gtQVBJLUtleScsICdNWV9BUElfS0VZJyk7XG4gKiAgIH0sXG4gKiAgIHByb2Nlc3NDb250ZW50OiBmdW5jdGlvbiAoY29udGVudCkge1xuICogICAgIHJldHVybiBZQU1MLnBhcnNlKGNvbnRlbnQpO1xuICogICB9XG4gKiB9KS50aGVuKGZ1bmN0aW9uIChyZXN1bHRzKSB7XG4gKiAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHJlc3VsdHMucmVzb2x2ZWQpKTsgLy8ge25hbWU6ICdqc29uLXJlZnMnLCBvd25lcjogeyAuLi4gfX1cbiAqICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkocmVzdWx0cy5tZXRhZGF0YSkpOyAvLyB7JyMvb3duZXInOiB7cmVmOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy93aGl0bG9ja2pjL2pzb24tcmVmcyMvb3duZXInfX1cbiAqIH0pO1xuICovXG5tb2R1bGUuZXhwb3J0cy5yZXNvbHZlUmVmcyA9IGZ1bmN0aW9uIHJlc29sdmVSZWZzIChqc29uLCBvcHRpb25zLCBkb25lKSB7XG4gIHZhciBhbGxUYXNrcyA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAyKSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihvcHRpb25zKSkge1xuICAgICAgZG9uZSA9IG9wdGlvbnM7XG4gICAgICBvcHRpb25zID0ge307XG4gICAgfVxuICB9XG5cbiAgaWYgKF8uaXNVbmRlZmluZWQob3B0aW9ucykpIHtcbiAgICBvcHRpb25zID0ge307XG4gIH1cblxuICBhbGxUYXNrcyA9IGFsbFRhc2tzLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgIGlmIChfLmlzVW5kZWZpbmVkKGpzb24pKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2pzb24gaXMgcmVxdWlyZWQnKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzUGxhaW5PYmplY3QoanNvbikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignanNvbiBtdXN0IGJlIGFuIG9iamVjdCcpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNQbGFpbk9iamVjdChvcHRpb25zKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0Jyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1VuZGVmaW5lZChkb25lKSAmJiAhXy5pc0Z1bmN0aW9uKGRvbmUpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ2RvbmUgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG4gICAgfVxuXG4gICAgLy8gVmFsaWRhdGUgdGhlIG9wdGlvbnMgKFRoaXMgb3B0aW9uIGRvZXMgbm90IGFwcGx5IHRvIClcbiAgICBpZiAoIV8uaXNVbmRlZmluZWQob3B0aW9ucy5wcm9jZXNzQ29udGVudCkgJiYgIV8uaXNGdW5jdGlvbihvcHRpb25zLnByb2Nlc3NDb250ZW50KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvcHRpb25zLnByb2Nlc3NDb250ZW50IG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQob3B0aW9ucy5wcmVwYXJlUmVxdWVzdCkgJiYgIV8uaXNGdW5jdGlvbihvcHRpb25zLnByZXBhcmVSZXF1ZXN0KSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvcHRpb25zLnByZXBhcmVSZXF1ZXN0IG11c3QgYmUgYSBmdW5jdGlvbicpO1xuICAgIH0gZWxzZSBpZiAoIV8uaXNVbmRlZmluZWQob3B0aW9ucy5sb2NhdGlvbikgJiYgIV8uaXNTdHJpbmcob3B0aW9ucy5sb2NhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignb3B0aW9ucy5sb2NhdGlvbiBtdXN0IGJlIGEgc3RyaW5nJyk7XG4gICAgfSBlbHNlIGlmICghXy5pc1VuZGVmaW5lZChvcHRpb25zLmRlcHRoKSAmJiAhXy5pc051bWJlcihvcHRpb25zLmRlcHRoKSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdvcHRpb25zLmRlcHRoIG11c3QgYmUgYSBudW1iZXInKTtcbiAgICB9IGVsc2UgaWYgKCFfLmlzVW5kZWZpbmVkKG9wdGlvbnMuZGVwdGgpICYmIG9wdGlvbnMuZGVwdGggPCAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ29wdGlvbnMuZGVwdGggbXVzdCBiZSBncmVhdGVyIG9yIGVxdWFsIHRvIHplcm8nKTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENsb25lIHRoZSBpbnB1dHMgc28gd2UgZG8gbm90IGFsdGVyIHRoZW1cbiAganNvbiA9IHRyYXZlcnNlKGpzb24pLmNsb25lKCk7XG4gIG9wdGlvbnMgPSB0cmF2ZXJzZShvcHRpb25zKS5jbG9uZSgpO1xuXG4gIGFsbFRhc2tzID0gYWxsVGFza3NcbiAgICAudGhlbihmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZVJlbW90ZVJlZnMoanNvbiwgb3B0aW9ucywgJyMnLCB7fSwge30pO1xuICAgIH0pXG4gICAgLnRoZW4oZnVuY3Rpb24gKG1ldGFkYXRhKSB7XG4gICAgICByZXR1cm4gcmVhbFJlc29sdmVSZWZzKG1ldGFkYXRhLnJlc29sdmVkLCBvcHRpb25zLCBtZXRhZGF0YS5tZXRhZGF0YSk7XG4gICAgfSk7XG5cbiAgLy8gVXNlIHRoZSBjYWxsYmFjayBpZiBwcm92aWRlZCBhbmQgaXQgaXMgYSBmdW5jdGlvblxuICBpZiAoIV8uaXNVbmRlZmluZWQoZG9uZSkgJiYgXy5pc0Z1bmN0aW9uKGRvbmUpKSB7XG4gICAgYWxsVGFza3MgPSBhbGxUYXNrc1xuICAgICAgLnRoZW4oZnVuY3Rpb24gKHJlc3VsdHMpIHtcbiAgICAgICAgZG9uZSh1bmRlZmluZWQsIHJlc3VsdHMucmVzb2x2ZWQsIHJlc3VsdHMubWV0YWRhdGEpO1xuICAgICAgfSwgZnVuY3Rpb24gKGVycikge1xuICAgICAgICBkb25lKGVycik7XG4gICAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBhbGxUYXNrcztcbn07XG4iLCIvKlxuICogVGhlIE1JVCBMaWNlbnNlIChNSVQpXG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0IEplcmVteSBXaGl0bG9ja1xuICpcbiAqIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbiAqIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbiAqIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbiAqIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbiAqIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuICogZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbiAqXG4gKiBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuICogYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4gKlxuICogVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuICogSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4gKiBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbiAqIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbiAqIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG4gKiBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG4gKiBUSEUgU09GVFdBUkUuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBUaGlzIGlzIGEgc2ltcGxlIHdyYXBwZXIgZm9yIExvZGFzaCBmdW5jdGlvbnMgYnV0IHVzaW5nIHNpbXBsZSBFUzUgYW5kIGV4aXN0aW5nIHJlcXVpcmVkIGRlcGVuZGVuY2llc1xuLy8gKGNsb25lRGVlcCB1c2VzIHRyYXZlcnNlIGZvciBleGFtcGxlKS4gIFRoZSByZWFzb24gZm9yIHRoaXMgd2FzIGEgbXVjaCBzbWFsbGVyIGZpbGUgc2l6ZS4gIEFsbCBleHBvcnRlZCBmdW5jdGlvbnNcbi8vIG1hdGNoIG1hcCB0byBhIGxvZGFzaCBlcXVpdmFsZW50LlxuXG52YXIgdHJhdmVyc2UgPSAodHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvd1sndHJhdmVyc2UnXSA6IHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWxbJ3RyYXZlcnNlJ10gOiBudWxsKTtcblxuZnVuY3Rpb24gaXNUeXBlIChvYmosIHR5cGUpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCAnICsgdHlwZSArICddJztcbn1cblxubW9kdWxlLmV4cG9ydHMuY2xvbmVEZWVwID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gdHJhdmVyc2Uob2JqKS5jbG9uZSgpO1xufTtcblxudmFyIGlzQXJyYXkgPSBtb2R1bGUuZXhwb3J0cy5pc0FycmF5ID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gaXNUeXBlKG9iaiwgJ0FycmF5Jyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5pc0Vycm9yID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gaXNUeXBlKG9iaiwgJ0Vycm9yJyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gaXNUeXBlKG9iaiwgJ0Z1bmN0aW9uJyk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5pc051bWJlciA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIGlzVHlwZShvYmosICdOdW1iZXInKTtcbn07XG5cbnZhciBpc1BsYWluT2JqZWN0ID0gbW9kdWxlLmV4cG9ydHMuaXNQbGFpbk9iamVjdCA9IGZ1bmN0aW9uIChvYmopIHtcbiAgcmV0dXJuIGlzVHlwZShvYmosICdPYmplY3QnKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLmlzU3RyaW5nID0gZnVuY3Rpb24gKG9iaikge1xuICByZXR1cm4gaXNUeXBlKG9iaiwgJ1N0cmluZycpO1xufTtcblxubW9kdWxlLmV4cG9ydHMuaXNVbmRlZmluZWQgPSBmdW5jdGlvbiAob2JqKSB7XG4gIC8vIENvbW1lbnRlZCBvdXQgZHVlIHRvIFBoYW50b21KUyBidWcgKGh0dHBzOi8vZ2l0aHViLmNvbS9hcml5YS9waGFudG9tanMvaXNzdWVzLzExNzIyKVxuICAvLyByZXR1cm4gaXNUeXBlKG9iaiwgJ1VuZGVmaW5lZCcpO1xuICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ3VuZGVmaW5lZCc7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5lYWNoID0gZnVuY3Rpb24gKHNvdXJjZSwgaGFuZGxlcikge1xuICBpZiAoaXNBcnJheShzb3VyY2UpKSB7XG4gICAgc291cmNlLmZvckVhY2goaGFuZGxlcik7XG4gIH0gZWxzZSBpZiAoaXNQbGFpbk9iamVjdChzb3VyY2UpKSB7XG4gICAgT2JqZWN0LmtleXMoc291cmNlKS5mb3JFYWNoKGZ1bmN0aW9uIChrZXkpIHtcbiAgICAgIGhhbmRsZXIoc291cmNlW2tleV0sIGtleSk7XG4gICAgfSk7XG4gIH1cbn07XG4iLCIvKiEgTmF0aXZlIFByb21pc2UgT25seVxuICAgIHYwLjguMSAoYykgS3lsZSBTaW1wc29uXG4gICAgTUlUIExpY2Vuc2U6IGh0dHA6Ly9nZXRpZnkubWl0LWxpY2Vuc2Uub3JnXG4qL1xuXG4oZnVuY3Rpb24gVU1EKG5hbWUsY29udGV4dCxkZWZpbml0aW9uKXtcblx0Ly8gc3BlY2lhbCBmb3JtIG9mIFVNRCBmb3IgcG9seWZpbGxpbmcgYWNyb3NzIGV2aXJvbm1lbnRzXG5cdGNvbnRleHRbbmFtZV0gPSBjb250ZXh0W25hbWVdIHx8IGRlZmluaXRpb24oKTtcblx0aWYgKHR5cGVvZiBtb2R1bGUgIT0gXCJ1bmRlZmluZWRcIiAmJiBtb2R1bGUuZXhwb3J0cykgeyBtb2R1bGUuZXhwb3J0cyA9IGNvbnRleHRbbmFtZV07IH1cblx0ZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkgeyBkZWZpbmUoZnVuY3Rpb24gJEFNRCQoKXsgcmV0dXJuIGNvbnRleHRbbmFtZV07IH0pOyB9XG59KShcIlByb21pc2VcIix0eXBlb2YgZ2xvYmFsICE9IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0aGlzLGZ1bmN0aW9uIERFRigpe1xuXHQvKmpzaGludCB2YWxpZHRoaXM6dHJ1ZSAqL1xuXHRcInVzZSBzdHJpY3RcIjtcblxuXHR2YXIgYnVpbHRJblByb3AsIGN5Y2xlLCBzY2hlZHVsaW5nX3F1ZXVlLFxuXHRcdFRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyxcblx0XHR0aW1lciA9ICh0eXBlb2Ygc2V0SW1tZWRpYXRlICE9IFwidW5kZWZpbmVkXCIpID9cblx0XHRcdGZ1bmN0aW9uIHRpbWVyKGZuKSB7IHJldHVybiBzZXRJbW1lZGlhdGUoZm4pOyB9IDpcblx0XHRcdHNldFRpbWVvdXRcblx0O1xuXG5cdC8vIGRhbW1pdCwgSUU4LlxuXHR0cnkge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh7fSxcInhcIix7fSk7XG5cdFx0YnVpbHRJblByb3AgPSBmdW5jdGlvbiBidWlsdEluUHJvcChvYmosbmFtZSx2YWwsY29uZmlnKSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaixuYW1lLHtcblx0XHRcdFx0dmFsdWU6IHZhbCxcblx0XHRcdFx0d3JpdGFibGU6IHRydWUsXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogY29uZmlnICE9PSBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXHRjYXRjaCAoZXJyKSB7XG5cdFx0YnVpbHRJblByb3AgPSBmdW5jdGlvbiBidWlsdEluUHJvcChvYmosbmFtZSx2YWwpIHtcblx0XHRcdG9ialtuYW1lXSA9IHZhbDtcblx0XHRcdHJldHVybiBvYmo7XG5cdFx0fTtcblx0fVxuXG5cdC8vIE5vdGU6IHVzaW5nIGEgcXVldWUgaW5zdGVhZCBvZiBhcnJheSBmb3IgZWZmaWNpZW5jeVxuXHRzY2hlZHVsaW5nX3F1ZXVlID0gKGZ1bmN0aW9uIFF1ZXVlKCkge1xuXHRcdHZhciBmaXJzdCwgbGFzdCwgaXRlbTtcblxuXHRcdGZ1bmN0aW9uIEl0ZW0oZm4sc2VsZikge1xuXHRcdFx0dGhpcy5mbiA9IGZuO1xuXHRcdFx0dGhpcy5zZWxmID0gc2VsZjtcblx0XHRcdHRoaXMubmV4dCA9IHZvaWQgMDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWRkOiBmdW5jdGlvbiBhZGQoZm4sc2VsZikge1xuXHRcdFx0XHRpdGVtID0gbmV3IEl0ZW0oZm4sc2VsZik7XG5cdFx0XHRcdGlmIChsYXN0KSB7XG5cdFx0XHRcdFx0bGFzdC5uZXh0ID0gaXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRmaXJzdCA9IGl0ZW07XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdCA9IGl0ZW07XG5cdFx0XHRcdGl0ZW0gPSB2b2lkIDA7XG5cdFx0XHR9LFxuXHRcdFx0ZHJhaW46IGZ1bmN0aW9uIGRyYWluKCkge1xuXHRcdFx0XHR2YXIgZiA9IGZpcnN0O1xuXHRcdFx0XHRmaXJzdCA9IGxhc3QgPSBjeWNsZSA9IHZvaWQgMDtcblxuXHRcdFx0XHR3aGlsZSAoZikge1xuXHRcdFx0XHRcdGYuZm4uY2FsbChmLnNlbGYpO1xuXHRcdFx0XHRcdGYgPSBmLm5leHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9KSgpO1xuXG5cdGZ1bmN0aW9uIHNjaGVkdWxlKGZuLHNlbGYpIHtcblx0XHRzY2hlZHVsaW5nX3F1ZXVlLmFkZChmbixzZWxmKTtcblx0XHRpZiAoIWN5Y2xlKSB7XG5cdFx0XHRjeWNsZSA9IHRpbWVyKHNjaGVkdWxpbmdfcXVldWUuZHJhaW4pO1xuXHRcdH1cblx0fVxuXG5cdC8vIHByb21pc2UgZHVjayB0eXBpbmdcblx0ZnVuY3Rpb24gaXNUaGVuYWJsZShvKSB7XG5cdFx0dmFyIF90aGVuLCBvX3R5cGUgPSB0eXBlb2YgbztcblxuXHRcdGlmIChvICE9IG51bGwgJiZcblx0XHRcdChcblx0XHRcdFx0b190eXBlID09IFwib2JqZWN0XCIgfHwgb190eXBlID09IFwiZnVuY3Rpb25cIlxuXHRcdFx0KVxuXHRcdCkge1xuXHRcdFx0X3RoZW4gPSBvLnRoZW47XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlb2YgX3RoZW4gPT0gXCJmdW5jdGlvblwiID8gX3RoZW4gOiBmYWxzZTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5vdGlmeSgpIHtcblx0XHRmb3IgKHZhciBpPTA7IGk8dGhpcy5jaGFpbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0bm90aWZ5SXNvbGF0ZWQoXG5cdFx0XHRcdHRoaXMsXG5cdFx0XHRcdCh0aGlzLnN0YXRlID09PSAxKSA/IHRoaXMuY2hhaW5baV0uc3VjY2VzcyA6IHRoaXMuY2hhaW5baV0uZmFpbHVyZSxcblx0XHRcdFx0dGhpcy5jaGFpbltpXVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0dGhpcy5jaGFpbi5sZW5ndGggPSAwO1xuXHR9XG5cblx0Ly8gTk9URTogVGhpcyBpcyBhIHNlcGFyYXRlIGZ1bmN0aW9uIHRvIGlzb2xhdGVcblx0Ly8gdGhlIGB0cnkuLmNhdGNoYCBzbyB0aGF0IG90aGVyIGNvZGUgY2FuIGJlXG5cdC8vIG9wdGltaXplZCBiZXR0ZXJcblx0ZnVuY3Rpb24gbm90aWZ5SXNvbGF0ZWQoc2VsZixjYixjaGFpbikge1xuXHRcdHZhciByZXQsIF90aGVuO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoY2IgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNoYWluLnJlamVjdChzZWxmLm1zZyk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0aWYgKGNiID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0cmV0ID0gc2VsZi5tc2c7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0cmV0ID0gY2IuY2FsbCh2b2lkIDAsc2VsZi5tc2cpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJldCA9PT0gY2hhaW4ucHJvbWlzZSkge1xuXHRcdFx0XHRcdGNoYWluLnJlamVjdChUeXBlRXJyb3IoXCJQcm9taXNlLWNoYWluIGN5Y2xlXCIpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChfdGhlbiA9IGlzVGhlbmFibGUocmV0KSkge1xuXHRcdFx0XHRcdF90aGVuLmNhbGwocmV0LGNoYWluLnJlc29sdmUsY2hhaW4ucmVqZWN0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjaGFpbi5yZXNvbHZlKHJldCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0Y2hhaW4ucmVqZWN0KGVycik7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVzb2x2ZShtc2cpIHtcblx0XHR2YXIgX3RoZW4sIHNlbGYgPSB0aGlzO1xuXG5cdFx0Ly8gYWxyZWFkeSB0cmlnZ2VyZWQ/XG5cdFx0aWYgKHNlbGYudHJpZ2dlcmVkKSB7IHJldHVybjsgfVxuXG5cdFx0c2VsZi50cmlnZ2VyZWQgPSB0cnVlO1xuXG5cdFx0Ly8gdW53cmFwXG5cdFx0aWYgKHNlbGYuZGVmKSB7XG5cdFx0XHRzZWxmID0gc2VsZi5kZWY7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChfdGhlbiA9IGlzVGhlbmFibGUobXNnKSkge1xuXHRcdFx0XHRzY2hlZHVsZShmdW5jdGlvbigpe1xuXHRcdFx0XHRcdHZhciBkZWZfd3JhcHBlciA9IG5ldyBNYWtlRGVmV3JhcHBlcihzZWxmKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0X3RoZW4uY2FsbChtc2csXG5cdFx0XHRcdFx0XHRcdGZ1bmN0aW9uICRyZXNvbHZlJCgpeyByZXNvbHZlLmFwcGx5KGRlZl93cmFwcGVyLGFyZ3VtZW50cyk7IH0sXG5cdFx0XHRcdFx0XHRcdGZ1bmN0aW9uICRyZWplY3QkKCl7IHJlamVjdC5hcHBseShkZWZfd3JhcHBlcixhcmd1bWVudHMpOyB9XG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QuY2FsbChkZWZfd3JhcHBlcixlcnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRzZWxmLm1zZyA9IG1zZztcblx0XHRcdFx0c2VsZi5zdGF0ZSA9IDE7XG5cdFx0XHRcdGlmIChzZWxmLmNoYWluLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzY2hlZHVsZShub3RpZnksc2VsZik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y2F0Y2ggKGVycikge1xuXHRcdFx0cmVqZWN0LmNhbGwobmV3IE1ha2VEZWZXcmFwcGVyKHNlbGYpLGVycik7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gcmVqZWN0KG1zZykge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdC8vIGFscmVhZHkgdHJpZ2dlcmVkP1xuXHRcdGlmIChzZWxmLnRyaWdnZXJlZCkgeyByZXR1cm47IH1cblxuXHRcdHNlbGYudHJpZ2dlcmVkID0gdHJ1ZTtcblxuXHRcdC8vIHVud3JhcFxuXHRcdGlmIChzZWxmLmRlZikge1xuXHRcdFx0c2VsZiA9IHNlbGYuZGVmO1xuXHRcdH1cblxuXHRcdHNlbGYubXNnID0gbXNnO1xuXHRcdHNlbGYuc3RhdGUgPSAyO1xuXHRcdGlmIChzZWxmLmNoYWluLmxlbmd0aCA+IDApIHtcblx0XHRcdHNjaGVkdWxlKG5vdGlmeSxzZWxmKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBpdGVyYXRlUHJvbWlzZXMoQ29uc3RydWN0b3IsYXJyLHJlc29sdmVyLHJlamVjdGVyKSB7XG5cdFx0Zm9yICh2YXIgaWR4PTA7IGlkeDxhcnIubGVuZ3RoOyBpZHgrKykge1xuXHRcdFx0KGZ1bmN0aW9uIElJRkUoaWR4KXtcblx0XHRcdFx0Q29uc3RydWN0b3IucmVzb2x2ZShhcnJbaWR4XSlcblx0XHRcdFx0LnRoZW4oXG5cdFx0XHRcdFx0ZnVuY3Rpb24gJHJlc29sdmVyJChtc2cpe1xuXHRcdFx0XHRcdFx0cmVzb2x2ZXIoaWR4LG1zZyk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZWplY3RlclxuXHRcdFx0XHQpO1xuXHRcdFx0fSkoaWR4KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBNYWtlRGVmV3JhcHBlcihzZWxmKSB7XG5cdFx0dGhpcy5kZWYgPSBzZWxmO1xuXHRcdHRoaXMudHJpZ2dlcmVkID0gZmFsc2U7XG5cdH1cblxuXHRmdW5jdGlvbiBNYWtlRGVmKHNlbGYpIHtcblx0XHR0aGlzLnByb21pc2UgPSBzZWxmO1xuXHRcdHRoaXMuc3RhdGUgPSAwO1xuXHRcdHRoaXMudHJpZ2dlcmVkID0gZmFsc2U7XG5cdFx0dGhpcy5jaGFpbiA9IFtdO1xuXHRcdHRoaXMubXNnID0gdm9pZCAwO1xuXHR9XG5cblx0ZnVuY3Rpb24gUHJvbWlzZShleGVjdXRvcikge1xuXHRcdGlmICh0eXBlb2YgZXhlY3V0b3IgIT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBUeXBlRXJyb3IoXCJOb3QgYSBmdW5jdGlvblwiKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fX05QT19fICE9PSAwKSB7XG5cdFx0XHR0aHJvdyBUeXBlRXJyb3IoXCJOb3QgYSBwcm9taXNlXCIpO1xuXHRcdH1cblxuXHRcdC8vIGluc3RhbmNlIHNoYWRvd2luZyB0aGUgaW5oZXJpdGVkIFwiYnJhbmRcIlxuXHRcdC8vIHRvIHNpZ25hbCBhbiBhbHJlYWR5IFwiaW5pdGlhbGl6ZWRcIiBwcm9taXNlXG5cdFx0dGhpcy5fX05QT19fID0gMTtcblxuXHRcdHZhciBkZWYgPSBuZXcgTWFrZURlZih0aGlzKTtcblxuXHRcdHRoaXNbXCJ0aGVuXCJdID0gZnVuY3Rpb24gdGhlbihzdWNjZXNzLGZhaWx1cmUpIHtcblx0XHRcdHZhciBvID0ge1xuXHRcdFx0XHRzdWNjZXNzOiB0eXBlb2Ygc3VjY2VzcyA9PSBcImZ1bmN0aW9uXCIgPyBzdWNjZXNzIDogdHJ1ZSxcblx0XHRcdFx0ZmFpbHVyZTogdHlwZW9mIGZhaWx1cmUgPT0gXCJmdW5jdGlvblwiID8gZmFpbHVyZSA6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdFx0Ly8gTm90ZTogYHRoZW4oLi4pYCBpdHNlbGYgY2FuIGJlIGJvcnJvd2VkIHRvIGJlIHVzZWQgYWdhaW5zdFxuXHRcdFx0Ly8gYSBkaWZmZXJlbnQgcHJvbWlzZSBjb25zdHJ1Y3RvciBmb3IgbWFraW5nIHRoZSBjaGFpbmVkIHByb21pc2UsXG5cdFx0XHQvLyBieSBzdWJzdGl0dXRpbmcgYSBkaWZmZXJlbnQgYHRoaXNgIGJpbmRpbmcuXG5cdFx0XHRvLnByb21pc2UgPSBuZXcgdGhpcy5jb25zdHJ1Y3RvcihmdW5jdGlvbiBleHRyYWN0Q2hhaW4ocmVzb2x2ZSxyZWplY3QpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlICE9IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgcmVqZWN0ICE9IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRcdHRocm93IFR5cGVFcnJvcihcIk5vdCBhIGZ1bmN0aW9uXCIpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0by5yZXNvbHZlID0gcmVzb2x2ZTtcblx0XHRcdFx0by5yZWplY3QgPSByZWplY3Q7XG5cdFx0XHR9KTtcblx0XHRcdGRlZi5jaGFpbi5wdXNoKG8pO1xuXG5cdFx0XHRpZiAoZGVmLnN0YXRlICE9PSAwKSB7XG5cdFx0XHRcdHNjaGVkdWxlKG5vdGlmeSxkZWYpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gby5wcm9taXNlO1xuXHRcdH07XG5cdFx0dGhpc1tcImNhdGNoXCJdID0gZnVuY3Rpb24gJGNhdGNoJChmYWlsdXJlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50aGVuKHZvaWQgMCxmYWlsdXJlKTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGV4ZWN1dG9yLmNhbGwoXG5cdFx0XHRcdHZvaWQgMCxcblx0XHRcdFx0ZnVuY3Rpb24gcHVibGljUmVzb2x2ZShtc2cpe1xuXHRcdFx0XHRcdHJlc29sdmUuY2FsbChkZWYsbXNnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZnVuY3Rpb24gcHVibGljUmVqZWN0KG1zZykge1xuXHRcdFx0XHRcdHJlamVjdC5jYWxsKGRlZixtc2cpO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZWplY3QuY2FsbChkZWYsZXJyKTtcblx0XHR9XG5cdH1cblxuXHR2YXIgUHJvbWlzZVByb3RvdHlwZSA9IGJ1aWx0SW5Qcm9wKHt9LFwiY29uc3RydWN0b3JcIixQcm9taXNlLFxuXHRcdC8qY29uZmlndXJhYmxlPSovZmFsc2Vcblx0KTtcblxuXHQvLyBOb3RlOiBBbmRyb2lkIDQgY2Fubm90IHVzZSBgT2JqZWN0LmRlZmluZVByb3BlcnR5KC4uKWAgaGVyZVxuXHRQcm9taXNlLnByb3RvdHlwZSA9IFByb21pc2VQcm90b3R5cGU7XG5cblx0Ly8gYnVpbHQtaW4gXCJicmFuZFwiIHRvIHNpZ25hbCBhbiBcInVuaW5pdGlhbGl6ZWRcIiBwcm9taXNlXG5cdGJ1aWx0SW5Qcm9wKFByb21pc2VQcm90b3R5cGUsXCJfX05QT19fXCIsMCxcblx0XHQvKmNvbmZpZ3VyYWJsZT0qL2ZhbHNlXG5cdCk7XG5cblx0YnVpbHRJblByb3AoUHJvbWlzZSxcInJlc29sdmVcIixmdW5jdGlvbiBQcm9taXNlJHJlc29sdmUobXNnKSB7XG5cdFx0dmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuXHRcdC8vIHNwZWMgbWFuZGF0ZWQgY2hlY2tzXG5cdFx0Ly8gbm90ZTogYmVzdCBcImlzUHJvbWlzZVwiIGNoZWNrIHRoYXQncyBwcmFjdGljYWwgZm9yIG5vd1xuXHRcdGlmIChtc2cgJiYgdHlwZW9mIG1zZyA9PSBcIm9iamVjdFwiICYmIG1zZy5fX05QT19fID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbXNnO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gZXhlY3V0b3IocmVzb2x2ZSxyZWplY3Qpe1xuXHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlICE9IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgcmVqZWN0ICE9IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHR0aHJvdyBUeXBlRXJyb3IoXCJOb3QgYSBmdW5jdGlvblwiKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzb2x2ZShtc2cpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRidWlsdEluUHJvcChQcm9taXNlLFwicmVqZWN0XCIsZnVuY3Rpb24gUHJvbWlzZSRyZWplY3QobXNnKSB7XG5cdFx0cmV0dXJuIG5ldyB0aGlzKGZ1bmN0aW9uIGV4ZWN1dG9yKHJlc29sdmUscmVqZWN0KXtcblx0XHRcdGlmICh0eXBlb2YgcmVzb2x2ZSAhPSBcImZ1bmN0aW9uXCIgfHwgdHlwZW9mIHJlamVjdCAhPSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0dGhyb3cgVHlwZUVycm9yKFwiTm90IGEgZnVuY3Rpb25cIik7XG5cdFx0XHR9XG5cblx0XHRcdHJlamVjdChtc2cpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRidWlsdEluUHJvcChQcm9taXNlLFwiYWxsXCIsZnVuY3Rpb24gUHJvbWlzZSRhbGwoYXJyKSB7XG5cdFx0dmFyIENvbnN0cnVjdG9yID0gdGhpcztcblxuXHRcdC8vIHNwZWMgbWFuZGF0ZWQgY2hlY2tzXG5cdFx0aWYgKFRvU3RyaW5nLmNhbGwoYXJyKSAhPSBcIltvYmplY3QgQXJyYXldXCIpIHtcblx0XHRcdHJldHVybiBDb25zdHJ1Y3Rvci5yZWplY3QoVHlwZUVycm9yKFwiTm90IGFuIGFycmF5XCIpKTtcblx0XHR9XG5cdFx0aWYgKGFyci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBDb25zdHJ1Y3Rvci5yZXNvbHZlKFtdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IENvbnN0cnVjdG9yKGZ1bmN0aW9uIGV4ZWN1dG9yKHJlc29sdmUscmVqZWN0KXtcblx0XHRcdGlmICh0eXBlb2YgcmVzb2x2ZSAhPSBcImZ1bmN0aW9uXCIgfHwgdHlwZW9mIHJlamVjdCAhPSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0dGhyb3cgVHlwZUVycm9yKFwiTm90IGEgZnVuY3Rpb25cIik7XG5cdFx0XHR9XG5cblx0XHRcdHZhciBsZW4gPSBhcnIubGVuZ3RoLCBtc2dzID0gQXJyYXkobGVuKSwgY291bnQgPSAwO1xuXG5cdFx0XHRpdGVyYXRlUHJvbWlzZXMoQ29uc3RydWN0b3IsYXJyLGZ1bmN0aW9uIHJlc29sdmVyKGlkeCxtc2cpIHtcblx0XHRcdFx0bXNnc1tpZHhdID0gbXNnO1xuXHRcdFx0XHRpZiAoKytjb3VudCA9PT0gbGVuKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShtc2dzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxyZWplY3QpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRidWlsdEluUHJvcChQcm9taXNlLFwicmFjZVwiLGZ1bmN0aW9uIFByb21pc2UkcmFjZShhcnIpIHtcblx0XHR2YXIgQ29uc3RydWN0b3IgPSB0aGlzO1xuXG5cdFx0Ly8gc3BlYyBtYW5kYXRlZCBjaGVja3Ncblx0XHRpZiAoVG9TdHJpbmcuY2FsbChhcnIpICE9IFwiW29iamVjdCBBcnJheV1cIikge1xuXHRcdFx0cmV0dXJuIENvbnN0cnVjdG9yLnJlamVjdChUeXBlRXJyb3IoXCJOb3QgYW4gYXJyYXlcIikpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ29uc3RydWN0b3IoZnVuY3Rpb24gZXhlY3V0b3IocmVzb2x2ZSxyZWplY3Qpe1xuXHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlICE9IFwiZnVuY3Rpb25cIiB8fCB0eXBlb2YgcmVqZWN0ICE9IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHR0aHJvdyBUeXBlRXJyb3IoXCJOb3QgYSBmdW5jdGlvblwiKTtcblx0XHRcdH1cblxuXHRcdFx0aXRlcmF0ZVByb21pc2VzKENvbnN0cnVjdG9yLGFycixmdW5jdGlvbiByZXNvbHZlcihpZHgsbXNnKXtcblx0XHRcdFx0cmVzb2x2ZShtc2cpO1xuXHRcdFx0fSxyZWplY3QpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRyZXR1cm4gUHJvbWlzZTtcbn0pO1xuIl19
