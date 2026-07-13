import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanExactDuplicates,
  findDuplicateGroups,
  rawDuplicateKey,
} from "../src/duplicates.js";

const shortcuts = [
  {
    id: "one",
    name: "Visual Studio Code",
    execPath: "C:\\Apps\\Code.exe",
    category: "Development",
    tags: ["code"],
    createdAt: 20,
    order: 2,
  },
  {
    id: "two",
    name: "VS Code",
    execPath: "C:/Apps/Code.exe",
    category: "Office",
    workspaceTags: ["Research"],
    tags: ["editor"],
    iconUrl: "data:image/png;base64,icon",
    isFavorite: true,
    createdAt: 10,
    order: 1,
  },
  {
    id: "three",
    name: "Visual Studio Code",
    execPath: "C:\\Different\\Code.exe",
    category: "Development",
    tags: [],
    createdAt: 30,
  },
];

test("normalises direct paths and URLs into stable exact keys", () => {
  assert.equal(rawDuplicateKey(shortcuts[0]), rawDuplicateKey(shortcuts[1]));
  assert.equal(
    rawDuplicateKey({ execPath: "https://EXAMPLE.com", id: "a" }),
    rawDuplicateKey({ execPath: "https://example.com/", id: "b" }),
  );
});

test("separates exact target matches from possible name matches", () => {
  const groups = findDuplicateGroups(shortcuts);
  assert.deepEqual(groups.exact.map((group) => group.shortcutIds), [["one", "two"]]);
  assert.deepEqual(groups.possible.map((group) => group.shortcutIds), [["one", "three"]]);
});

test("uses desktop-resolved shortcut targets when available", () => {
  const launchers = [
    { ...shortcuts[0], id: "lnk-a", execPath: "C:\\Desktop\\Code.lnk" },
    { ...shortcuts[1], id: "lnk-b", execPath: "C:\\Public\\Code.lnk" },
  ];
  const groups = findDuplicateGroups(launchers, {
    "lnk-a": "target:c:\\apps\\code.exe|args:",
    "lnk-b": "target:c:\\apps\\code.exe|args:",
  });
  assert.deepEqual(groups.exact[0].shortcutIds, ["lnk-a", "lnk-b"]);
});

test("one-go cleanup retains and merges useful metadata", () => {
  const groups = findDuplicateGroups(shortcuts);
  const result = cleanExactDuplicates(shortcuts, groups.exact);
  assert.equal(result.removedCount, 1);
  assert.equal(result.shortcuts.length, 2);
  const survivor = result.shortcuts.find((shortcut) => shortcut.id === "two");
  assert.equal(survivor.isFavorite, true);
  assert.equal(survivor.iconUrl, "data:image/png;base64,icon");
  assert.deepEqual(survivor.tags, ["code", "editor"]);
  assert.deepEqual(survivor.workspaceTags, ["Development", "Research"]);
});
