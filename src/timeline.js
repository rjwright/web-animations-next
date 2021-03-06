// Copyright 2014 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//     You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//     See the License for the specific language governing permissions and
// limitations under the License.


(function(shared, scope, testing) {
  var originalRequestAnimationFrame = window.requestAnimationFrame;
  var rafCallbacks = [];
  window.requestAnimationFrame = function(f) {
    if (rafCallbacks.length == 0 && !WEB_ANIMATIONS_TESTING) {
      originalRequestAnimationFrame(processRafCallbacks);
    }
    rafCallbacks.push(f);
  };

  function processRafCallbacks(t) {
    var processing = rafCallbacks;
    rafCallbacks = [];
    tick(t);
    processing.forEach(function(f) { f(t); });
    if (needsRetick)
      tick(t);
    applyPendingEffects();
  }

  function comparePlayers(leftPlayer, rightPlayer) {
    return leftPlayer._sequenceNumber - rightPlayer._sequenceNumber;
  }

  scope.AnimationTimeline = function() {
    this._players = [];
    this.currentTime = undefined;
  };

  scope.AnimationTimeline.prototype = {
    _play: function(source) {
      source._timing = shared.normalizeTimingInput(source.timing);
      var player = new scope.Player(source);
      player._timeline = this;
      this._players.push(player);
      scope.restart();
      scope.invalidateEffects();
      return player;
    },
    // FIXME: This needs to return the wrapped players in maxifill
    getAnimationPlayers: function() {
      if (needsRetick)
        tick(timeline.currentTime);
      return this._players.filter(function(player) {
        return player._source._isCurrent(player.currentTime);
      }).sort(comparePlayers);
    }
  };

  var ticking = false;
  var hasRestartedThisFrame = false;

  scope.restart = function() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(function() {});
      hasRestartedThisFrame = true;
    }
    return hasRestartedThisFrame;
  };

  var needsRetick = false;
  scope.invalidateEffects = function() {
    needsRetick = true;
  };

  var pendingEffects = [];
  function applyPendingEffects() {
    pendingEffects.forEach(function(f) { f(); });
  }

  var originalGetComputedStyle = window.getComputedStyle;
  Object.defineProperty(window, 'getComputedStyle', {
    configurable: true,
    enumerable: true,
    value: function() {
      if (needsRetick) tick(timeline.currentTime);
      applyPendingEffects();
      return originalGetComputedStyle.apply(this, arguments);
    },
  });

  function tick(t) {
    hasRestartedThisFrame = false;
    var timeline = window.document.timeline;
    timeline.currentTime = t;
    timeline._players.sort(comparePlayers);
    ticking = false;
    var updatingPlayers = timeline._players;
    timeline._players = [];

    var newPendingClears = [];
    var newPendingEffects = [];
    updatingPlayers = updatingPlayers.filter(function(player) {
      player._inTimeline = player._tick(t);

      if (!player._inEffect)
        newPendingClears.push(player._source);
      else
        newPendingEffects.push(player._source);

      if (!player.finished && !player.paused)
        ticking = true;

      return player._inTimeline;
    });

    pendingEffects.length = 0;
    pendingEffects.push.apply(pendingEffects, newPendingClears);
    pendingEffects.push.apply(pendingEffects, newPendingEffects);

    timeline._players.push.apply(timeline._players, updatingPlayers);
    needsRetick = false;

    if (ticking)
      requestAnimationFrame(function() {});
  };

  if (WEB_ANIMATIONS_TESTING) {
    testing.tick = processRafCallbacks;
    testing.isTicking = function() { return ticking; };
    testing.setTicking = function(newVal) { ticking = newVal; };
  }

  var timeline = new scope.AnimationTimeline();
  scope.timeline = timeline;
  try {
    Object.defineProperty(window.document, 'timeline', {
      configurable: true,
      get: function() { return timeline; }
    });
  } catch (e) { }
  try {
    window.document.timeline = timeline;
  } catch (e) { }

})(webAnimationsShared, webAnimationsMinifill, webAnimationsTesting);
