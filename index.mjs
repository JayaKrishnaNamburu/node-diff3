export default Diff3;

var Diff3 = {

  LCS: function(file1, file2) {
    /* Text diff algorithm following Hunt and McIlroy 1976.
     * J. W. Hunt and M. D. McIlroy, An algorithm for differential file
     * comparison, Bell Telephone Laboratories CSTR #41 (1976)
     * http://www.cs.dartmouth.edu/~doug/
     *
     * Expects two arrays of strings.
     */
    var equivalenceClasses;
    var file2indices;
    var newCandidate;
    var candidates;
    var line;
    var c, i, j, jX, r, s;

    equivalenceClasses = {};
    for (j = 0; j < file2.length; j++) {
      line = file2[j];
      if (equivalenceClasses[line]) {
        equivalenceClasses[line].push(j);
      } else {
        equivalenceClasses[line] = [j];
      }
    }

    candidates = [
      { file1index: -1, file2index: -1, chain: null }
    ];

    for (i = 0; i < file1.length; i++) {
      line = file1[i];
      file2indices = equivalenceClasses[line] || [];

      r = 0;
      c = candidates[0];

      for (jX = 0; jX < file2indices.length; jX++) {
        j = file2indices[jX];

        for (s = r; s < candidates.length; s++) {
          if ((candidates[s].file2index < j) && ((s === candidates.length - 1) || (candidates[s + 1].file2index > j))) {
            break;
          }
        }

        if (s < candidates.length) {
          newCandidate = { file1index: i, file2index: j, chain: candidates[s] };
          if (r === candidates.length) {
            candidates.push(c);
          } else {
            candidates[r] = c;
          }
          r = s + 1;
          c = newCandidate;
          if (r === candidates.length) {
            break; // no point in examining further (j)s
          }
        }
      }

      candidates[r] = c;
    }

    // At this point, we know the LCS: it's in the reverse of the
    // linked-list through .chain of
    // candidates[candidates.length - 1].

    return candidates[candidates.length - 1];
  },


  diffComm: function(file1, file2) {
    // We apply the LCS to build a 'comm'-style picture of the
    // differences between file1 and file2.

    var result = [];
    var tail1 = file1.length;
    var tail2 = file2.length;
    var common = {common: []};

    function processCommon() {
      if (common.common.length) {
        common.common.reverse();
        result.push(common);
        common = {common: []};
      }
    }

    for (var candidate = Diff3.LCS(file1, file2);
         candidate !== null;
         candidate = candidate.chain)
    {
      var different = {file1: [], file2: []};

      while (--tail1 > candidate.file1index) {
        different.file1.push(file1[tail1]);
      }

      while (--tail2 > candidate.file2index) {
        different.file2.push(file2[tail2]);
      }

      if (different.file1.length || different.file2.length) {
        processCommon();
        different.file1.reverse();
        different.file2.reverse();
        result.push(different);
      }

      if (tail1 >= 0) {
        common.common.push(file1[tail1]);
      }
    }

    processCommon();

    result.reverse();
    return result;
  },


  diffPatch: function(file1, file2) {
    // We apply the LCD to build a JSON representation of a
    // diff(1)-style patch.

    var result = [];
    var tail1 = file1.length;
    var tail2 = file2.length;

    function chunkDescription(file, offset, length) {
      var chunk = [];
      for (var i = 0; i < length; i++) {
        chunk.push(file[offset + i]);
      }
      return {
        offset: offset,
        length: length,
        chunk: chunk
      };
    }

    for (var candidate = Diff3.LCS(file1, file2);
         candidate !== null;
         candidate = candidate.chain)
    {
      var mismatchLength1 = tail1 - candidate.file1index - 1;
      var mismatchLength2 = tail2 - candidate.file2index - 1;
      tail1 = candidate.file1index;
      tail2 = candidate.file2index;

      if (mismatchLength1 || mismatchLength2) {
        result.push({
          file1: chunkDescription(file1, candidate.file1index + 1, mismatchLength1),
          file2: chunkDescription(file2, candidate.file2index + 1, mismatchLength2)
        });
      }
    }

    result.reverse();
    return result;
  },


  stripPatch: function(patch) {
    // Takes the output of Diff3.diffPatch(), and removes
    // information from it. It can still be used by patch(),
    // below, but can no longer be inverted.
    var newpatch = [];
    for (var i = 0; i < patch.length; i++) {
      var chunk = patch[i];
      newpatch.push({
        file1: { offset: chunk.file1.offset, length: chunk.file1.length },
        file2: { chunk: chunk.file2.chunk }
      });
    }
    return newpatch;
  },


  invertPatch: function(patch) {
    // Takes the output of Diff3.diffPatch(), and inverts the
    // sense of it, so that it can be applied to file2 to give
    // file1 rather than the other way around.

    for (var i = 0; i < patch.length; i++) {
      var chunk = patch[i];
      var tmp = chunk.file1;
      chunk.file1 = chunk.file2;
      chunk.file2 = tmp;
    }
  },


  patch: function (file, patch) {
    // Applies a patch to a file.
    //
    // Given file1 and file2, Diff3.patch(file1,
    // Diff3.diffPatch(file1, file2)) should give file2.

    var result = [];
    var commonOffset = 0;

    function copyCommon(targetOffset) {
      while (commonOffset < targetOffset) {
        result.push(file[commonOffset]);
        commonOffset++;
      }
    }

    for (var chunkIndex = 0; chunkIndex < patch.length; chunkIndex++) {
      var chunk = patch[chunkIndex];
      copyCommon(chunk.file1.offset);
      for (var lineIndex = 0; lineIndex < chunk.file2.chunk.length; lineIndex++) {
        result.push(chunk.file2.chunk[lineIndex]);
      }
      commonOffset += chunk.file1.length;
    }

    copyCommon(file.length);
    return result;
  },


  diffIndices: function(file1, file2) {
    // We apply the LCS to give a simple representation of the
    // offsets and lengths of mismatched chunks in the input
    // files. This is used by diff3MergeIndices below.

    var result = [];
    var tail1 = file1.length;
    var tail2 = file2.length;

    for (var candidate = Diff3.LCS(file1, file2);
       candidate !== null;
       candidate = candidate.chain)
    {
      var mismatchLength1 = tail1 - candidate.file1index - 1;
      var mismatchLength2 = tail2 - candidate.file2index - 1;
      tail1 = candidate.file1index;
      tail2 = candidate.file2index;

      if (mismatchLength1 || mismatchLength2) {
        result.push({
          file1: [tail1 + 1, mismatchLength1],
          file2: [tail2 + 1, mismatchLength2]
        });
      }
    }

    result.reverse();
    return result;
  },


  diff3MergeIndices: function (a, o, b) {
    // Given three files, A, O, and B, where both A and B are
    // independently derived from O, returns a fairly complicated
    // internal representation of merge decisions it's taken. The
    // interested reader may wish to consult
    //
    // Sanjeev Khanna, Keshav Kunal, and Benjamin C. Pierce.
    // 'A Formal Investigation of Diff3.' In Arvind and Prasad,
    // editors, Foundations of Software Technology and Theoretical
    // Computer Science (FSTTCS), December 2007.
    //
    // (http://www.cis.upenn.edu/~bcpierce/papers/diff3-short.pdf)
    var i;

    var m1 = Diff3.diffIndices(o, a);
    var m2 = Diff3.diffIndices(o, b);

    var hunks = [];
    function addHunk(h, side) {
      hunks.push([h.file1[0], side, h.file1[1], h.file2[0], h.file2[1]]);
    }
    for (i = 0; i < m1.length; i++) { addHunk(m1[i], 0); }
    for (i = 0; i < m2.length; i++) { addHunk(m2[i], 2); }
    hunks.sort(function (x, y) { return x[0] - y[0]; });

    var result = [];
    var commonOffset = 0;
    function copyCommon(targetOffset) {
      if (targetOffset > commonOffset) {
        result.push([1, commonOffset, targetOffset - commonOffset]);
        commonOffset = targetOffset;
      }
    }

    for (var hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
      var firstHunkIndex = hunkIndex;
      var hunk = hunks[hunkIndex];
      var regionLhs = hunk[0];
      var regionRhs = regionLhs + hunk[2];
      while (hunkIndex < hunks.length - 1) {
        var maybeOverlapping = hunks[hunkIndex + 1];
        var maybeLhs = maybeOverlapping[0];
        if (maybeLhs > regionRhs) {
          break;
        }
        regionRhs = Math.max(regionRhs, maybeLhs + maybeOverlapping[2]);
        hunkIndex++;
      }

      copyCommon(regionLhs);
      if (firstHunkIndex === hunkIndex) {
        // The 'overlap' was only one hunk long, meaning that
        // there's no conflict here. Either a and o were the
        // same, or b and o were the same.
        if (hunk[4] > 0) {
          result.push([hunk[1], hunk[3], hunk[4]]);
        }
      } else {
        // A proper conflict. Determine the extents of the
        // regions involved from a, o and b. Effectively merge
        // all the hunks on the left into one giant hunk, and
        // do the same for the right; then, correct for skew
        // in the regions of o that each side changed, and
        // report appropriate spans for the three sides.
        var regions = {
          0: [a.length, -1, o.length, -1],
          2: [b.length, -1, o.length, -1]
        };
        for (i = firstHunkIndex; i <= hunkIndex; i++) {
          hunk = hunks[i];
          var side = hunk[1];
          var r = regions[side];
          var oLhs = hunk[0];
          var oRhs = oLhs + hunk[2];
          var abLhs = hunk[3];
          var abRhs = abLhs + hunk[4];
          r[0] = Math.min(abLhs, r[0]);
          r[1] = Math.max(abRhs, r[1]);
          r[2] = Math.min(oLhs, r[2]);
          r[3] = Math.max(oRhs, r[3]);
        }
        var aLhs = regions[0][0] + (regionLhs - regions[0][2]);
        var aRhs = regions[0][1] + (regionRhs - regions[0][3]);
        var bLhs = regions[2][0] + (regionLhs - regions[2][2]);
        var bRhs = regions[2][1] + (regionRhs - regions[2][3]);
        result.push([-1,
                     aLhs,      aRhs      - aLhs,
                     regionLhs, regionRhs - regionLhs,
                     bLhs,      bRhs      - bLhs]);
      }
      commonOffset = regionRhs;
    }

    copyCommon(o.length);
    return result;
  },


  diff3Merge: function (a, o, b, excludeFalseConflicts) {
    // Applies the output of Diff3.diff3MergeIndices to actually
    // construct the merged file; the returned result alternates
    // between 'ok' and 'conflict' blocks.

    var result = [];
    var files = [a, o, b];
    var indices = Diff3.diff3MergeIndices(a, o, b);

    var okLines = [];
    function flushOk() {
      if (okLines.length) {
        result.push({ok: okLines});
      }
      okLines = [];
    }
    function pushOk(xs) {
      for (var j = 0; j < xs.length; j++) {
        okLines.push(xs[j]);
      }
    }

    function isTrueConflict(rec) {
      if (rec[2] !== rec[6]) return true;
      var aoff = rec[1];
      var boff = rec[5];
      for (var j = 0; j < rec[2]; j++) {
        if (a[j + aoff] !== b[j + boff]) {
          return true;
        }
      }
      return false;
    }

    for (var i = 0; i < indices.length; i++) {
      var x = indices[i];
      var side = x[0];
      if (side === -1) {
        if (excludeFalseConflicts && !isTrueConflict(x)) {
          pushOk(files[0].slice(x[1], x[1] + x[2]));
        } else {
          flushOk();
          result.push({
            conflict: {
              a: a.slice(x[1], x[1] + x[2]),
              aIndex: x[1],
              o: o.slice(x[3], x[3] + x[4]),
              oIndex: x[3],
              b: b.slice(x[5], x[5] + x[6]),
              bIndex: x[5]
            }
          });
        }
      } else {
        pushOk(files[side].slice(x[1], x[1] + x[2]));
      }
    }

    flushOk();
    return result;
  },

  merge: function (a, o, b) {
    var merger = Diff3.diff3Merge(a, o, b, true);
    var conflict = false;
    var lines = [];
    for (var i = 0; i < merger.length; i++) {
      var item = merger[i];
      if (item.ok) {
        lines = lines.concat(item.ok);
      } else {
        conflict = true;
        lines = lines.concat(
          ['\n<<<<<<<<<\n'], item.conflict.a,
          ['\n=========\n'], item.conflict.b,
          ['\n>>>>>>>>>\n']
        );
      }
    }
    return {
      conflict: conflict,
      result: lines
    };
  },


  mergeDigIn: function (a, o, b) {
    var merger = Diff3.diff3Merge(a, o, b, false);
    var conflict = false;
    var lines = [];
    for (var i = 0; i < merger.length; i++) {
      var item = merger[i];
      if (item.ok) {
        lines = lines.concat(item.ok);
      } else {
        var c = Diff3.diffComm(item.conflict.a, item.conflict.b);
        for (var j = 0; j < c.length; j++) {
          var inner = c[j];
          if (inner.common) {
            lines = lines.concat(inner.common);
          } else {
            conflict = true;
            lines = lines.concat(
              ['\n<<<<<<<<<\n'], inner.file1,
              ['\n=========\n'], inner.file2,
              ['\n>>>>>>>>>\n']
            );
          }
        }
      }
    }
    return {
      conflict: conflict,
      result: lines
    };
  }

};
