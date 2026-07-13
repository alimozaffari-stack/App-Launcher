import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NOMINATED_CARD_PREFIX,
  NOMINATED_WORKSPACE_DROP_ID,
  addShortcutToWorkspace,
  isNominatedDropTarget,
  isShortcutInWorkspace,
  readTemporaryFolders,
  removeShortcutFromWorkspace,
  suggestShortcutTags,
  updateShortcutsInBulk,
} from "../src/workspace.js";

const shortcuts = [
  { id: "one", category: "Office", tags: [], workspaceTags: [], name: "One" },
  { id: "two", category: "Research", tags: [], name: "Two" },
];

test("recognises the nominated panel and its cards as drop targets", () => {
  assert.equal(isNominatedDropTarget(NOMINATED_WORKSPACE_DROP_ID), true);
  assert.equal(isNominatedDropTarget(`${NOMINATED_CARD_PREFIX}one`), true);
  assert.equal(isNominatedDropTarget("one"), false);
});

test("adds workspace membership without moving the shortcut category", () => {
  const updated = addShortcutToWorkspace(shortcuts, "two", "Office");
  assert.equal(updated[1].category, "Research");
  assert.deepEqual(updated[1].workspaceTags, ["Office"]);
  assert.equal(isShortcutInWorkspace(updated[1], "Office"), true);
});

test("does not add a redundant tag to a shortcut already in the workspace category", () => {
  assert.equal(addShortcutToWorkspace(shortcuts, "one", "Office"), shortcuts);
});

test("workspace membership is idempotent and removable", () => {
  const added = addShortcutToWorkspace(shortcuts, "two", "Office");
  assert.equal(addShortcutToWorkspace(added, "two", "Office"), added);
  const removed = removeShortcutFromWorkspace(added, "two", "Office");
  assert.equal(removed[1].workspaceTags, undefined);
  assert.equal(isShortcutInWorkspace(removed[1], "Office"), false);
});

test("validates temporary folder session data", () => {
  const valid = {
    id: "folder-one",
    name: "Project",
    path: "C:\\Projects\\Project",
    workspace: "Office",
    createdAt: 1,
  };
  assert.deepEqual(readTemporaryFolders(JSON.stringify([valid, { id: 3 }])), [valid]);
  assert.deepEqual(readTemporaryFolders("not-json"), []);
});

test("suggests no more than three deterministic local tags", () => {
  assert.deepEqual(
    suggestShortcutTags({
      name: "Visual Studio Code",
      execPath: "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      category: "Development",
    }),
    ["development", "visual", "studio"],
  );
  assert.deepEqual(
    suggestShortcutTags({
      name: "Research Portal",
      execPath: "https://example.com/research",
      category: "Research",
    }),
    ["website", "research", "portal"],
  );
  assert.deepEqual(
    suggestShortcutTags(
      { name: "Blender Design", execPath: "C:\\Apps\\Blender.exe", category: "Creative" },
      2,
    ),
    ["creative", "design"],
  );
});

test("bulk updates tags without touching unselected shortcuts", () => {
  const updated = updateShortcutsInBulk(shortcuts, new Set(["two"]), {
    type: "add-tags",
    tags: ["Work", "research", "work"],
  });
  assert.equal(updated[0], shortcuts[0]);
  assert.deepEqual(updated[1].tags, ["work", "research"]);

  const replaced = updateShortcutsInBulk(updated, ["two"], {
    type: "replace-tags",
    tags: ["Focused"],
  });
  assert.deepEqual(replaced[1].tags, ["focused"]);
});

test("bulk primary-group changes preserve the former primary membership", () => {
  const grouped = updateShortcutsInBulk(shortcuts, ["two"], {
    type: "add-group",
    group: "AI",
  });
  assert.deepEqual(grouped[1].workspaceTags, ["AI"]);

  const promoted = updateShortcutsInBulk(grouped, ["two"], {
    type: "set-primary-group",
    group: "Office",
  });
  assert.equal(promoted[1].category, "Office");
  assert.deepEqual(promoted[1].workspaceTags, ["AI", "Research"]);
  assert.equal(isShortcutInWorkspace(promoted[1], "Research"), true);
});
