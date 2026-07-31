import assert from "node:assert/strict";
import test from "node:test";
import { workspacePathCue } from "../src/lib/workspacePathCue";

test("shows the drive and nearest parent context for a Windows folder", () => {
  assert.equal(
    workspacePathCue("G:\\My Drive\\02- WRITING\\Book Chapters\\Heritage and Civilisation\\Readings\\Books"),
    "G:\\…\\Heritage and Civilisation\\Readings"
  );
});

test("distinguishes folders with the same name in different parent trees", () => {
  assert.notEqual(
    workspacePathCue("G:\\My Drive\\02- WRITING\\Book Chapters\\Heritage and Civilisation\\Readings\\Books"),
    workspacePathCue("G:\\My Drive\\02- WRITING\\Book Chapters\\_HERITAGE AND CIVILISATION_DUP\\Readings\\Books")
  );
});

test("keeps a concise root cue for a root-level folder", () => {
  assert.equal(workspacePathCue("G:\\Books"), "G:\\");
});

test("handles Unix-style paths without a drive", () => {
  assert.equal(workspacePathCue("/home/ali/projects/heritage/readings/books"), "/…/heritage/readings");
});
