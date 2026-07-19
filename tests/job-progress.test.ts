import assert from "node:assert/strict";
import { jobProgress, jobStatusLabel } from "../src/client/ui/AutomationActivityBar";

assert.equal(jobProgress({ status: "queued", currentStepIndex: 0, totalSteps: 5 }), 0);
assert.equal(jobProgress({ status: "running", currentStepIndex: 2, totalSteps: 5 }), 40);
assert.equal(jobProgress({ status: "waiting_approval", currentStepIndex: 3, totalSteps: 5 }), 60);
assert.equal(jobProgress({ status: "succeeded", currentStepIndex: 5, totalSteps: 5 }), 100);
assert.equal(jobProgress({ status: "running", currentStepIndex: 8, totalSteps: 5 }), 100);
assert.equal(jobStatusLabel("waiting_approval"), "Onay bekleniyor");

console.log(JSON.stringify({ ok: true, progress: [0, 40, 60, 100] }));
