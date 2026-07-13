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
