/* js/data.js — mock seed data. Every content item the PRD leaves open is tagged PLACEHOLDER (D17).
   Sets window.SB.seed (state shape, see CLAUDE.md "Data contract") and window.SB.seedExpectedMetrics
   (hand-computed test data; never stored).

   Story of the seed, demo.now = Mon Nov 16, 2026 12:00 PM MT:
   - Cycle 1 (STAT 121 Exam 2 on Nov 12, CHEM 105 Midterm 2 on Nov 13) is over: two slots dropped,
     three sessions ran (one split into two tables), with attended / released / cancelled / no-show seats.
   - Cycle 2 (both exams on Nov 20) is under way:
       slt_stat121_m2_mon   locked, today 4:00 PM, 2 students still placed (3 placed, 1 cancelled) -> low turnout at 1:00 PM
       slt_stat121_m2_wed   open, 49h out, 4 picks -> locks at 1:00 PM
       slt_chem105_m2_wed   open, 49.5h out, 2 picks -> drops at 1:30 PM
       slt_chem105_m2_thu   open, 8 picks -> splits into two tables of 4 on Tue 4:00 PM
   - Tyler has 2 misses (one per class, both from cycle 1, so both have reset for cycle 2), Noah has 1.
     Ben's check-in is unverified and waiting for review.
   - Zoe started sign-up but didn't finish. Lily only ever picked a slot that dropped. */
(function () {
  "use strict";
  var SB = (window.SB = window.SB || {});

  function t(dayTime) { return "2026-11-" + dayTime + ":00-07:00"; } // t("16T12:00") -> "2026-11-16T12:00:00-07:00"
  function allJobs() {
    return { earlyAskSent: true, lowTurnoutSent: true, earlyReleaseDone: true, confirmSent: true,
      startDone: true, endDone: true, finalDone: true };
  }
  // The Mon 4:00 PM session at 12:00 PM: only the T−24h early ask has run (it had no early seats).
  function todayJobs() {
    return { earlyAskSent: true, lowTurnoutSent: false, earlyReleaseDone: false, confirmSent: false,
      startDone: false, endDone: false, finalDone: false };
  }

  function stu(key, first, year, vibe, courseIds, onboarding) {
    return {
      id: "stu_" + key, email: key + "." + first.toLowerCase().charAt(0) + "@byu.edu", // PLACEHOLDER emails
      firstName: first, year: year, vibe: vibe, courseIds: courseIds,
      onboarding: onboarding || { profile: true, conduct: true, intake: true, permissions: true }
    };
  }
  function pick(slotKey, who, at, status) {
    return { id: "pck_" + slotKey + "_" + who, slotId: "slt_" + slotKey, studentId: "stu_" + who, at: t(at),
      status: status, removedReason: status === "removed" ? "student" : null };
  }
  function seat(sesKey, who, status, confirmedAt, cancelledAt, cancelReason) {
    return { id: "set_" + sesKey + "_" + who, sessionId: "ses_" + sesKey, studentId: "stu_" + who, status: status,
      confirmedAt: confirmedAt ? t(confirmedAt) : null, cancelledAt: cancelledAt ? t(cancelledAt) : null,
      cancelReason: cancelReason || null, earlyConfirm: false };
  }
  function chk(sesKey, who, at, result) {
    return { id: "chk_" + sesKey + "_" + who, seatId: "set_" + sesKey + "_" + who, at: t(at), result: result,
      adminDecision: null };
  }
  var nCount = 0;
  function ntf(to, at, kind, read, route, slotId, sessionId, text, suggestedSlotId) {
    nCount += 1;
    return { id: "ntf_" + nCount, to: to, at: t(at), read: read, route: route, kind: kind,
      slotId: slotId || null, sessionId: sessionId || null, suggestedSlotId: suggestedSlotId || null, text: text };
  }
  function intake(who, connect, distracted, hours, at) {
    return { studentId: "stu_" + who, kind: "intake",
      answers: { q_in_connect: connect, q_in_distracted: distracted, q_in_hours: hours, q_in_notes: "" },
      nps: null, at: t(at) };
  }

  // Slot keys used in IDs
  var S121_M1_MON = "stat121_m1_mon", S121_M1_TUE = "stat121_m1_tue", S121_M1_WED = "stat121_m1_wed";
  var C105_M1_MON = "chem105_m1_mon", C105_M1_WED = "chem105_m1_wed";
  var S121_M2_MON = "stat121_m2_mon", S121_M2_WED = "stat121_m2_wed", S121_M2_THU = "stat121_m2_thu";
  var C105_M2_WED = "chem105_m2_wed", C105_M2_THU = "chem105_m2_thu", C105_M2_EVE = "chem105_m2_thueve";

  // Session keys used in IDs
  var SES_A = "stat121_m1_tue_1", SES_B = "stat121_m1_wed_1";
  var SES_C1 = "chem105_m1_wed_1", SES_C2 = "chem105_m1_wed_2", SES_D = "stat121_m2_mon_1";

  var confirmedText = function (when, place, spot, table, mates) {
    return "Session confirmed: " + when + " at " + place + ", " + spot + " (table " + table + "). Your table: " +
      mates + ".";
  };

  var missText = function (cls) {
    return "Looks like you missed your " + cls + " session. Life happens! Next time, tapping “Can't make it” lets your group know.";
  };

  var notifications = [
    // Nov 7: two cycle-1 slots drop
    ntf("stu_priya", "07T12:00", "slot_dropped", true, "#/exams", "slt_" + S121_M1_MON, null,
      "Your Mon, Nov 9 · 12:00 PM slot for STAT 121 Exam 2 was dropped: fewer than 3 people picked it. Try Wed, Nov 11 · 7:00 PM at Tanner Building atrium instead (3 going).",
      "slt_" + S121_M1_WED),
    ntf("stu_sam", "07T12:00", "slot_dropped", true, "#/exams", "slt_" + S121_M1_MON, null,
      "Your Mon, Nov 9 · 12:00 PM slot for STAT 121 Exam 2 was dropped: fewer than 3 people picked it. Try Wed, Nov 11 · 7:00 PM at Tanner Building atrium instead (3 going).",
      "slt_" + S121_M1_WED),
    ntf("stu_lily", "07T18:00", "slot_dropped", true, "#/exams", "slt_" + C105_M1_MON, null,
      "Your Mon, Nov 9 · 6:00 PM slot for CHEM 105 Midterm 2 was dropped: fewer than 3 people picked it. Try Wed, Nov 11 · 3:00 PM at Benson Building 2nd floor instead (7 going).",
      "slt_" + C105_M1_WED),
    // Nov 8 4:00 PM: STAT Tue slot locks, one table
    ntf("stu_maya", "08T16:00", "session_confirmed", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      confirmedText("Tue, Nov 10 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Priya, Sam, Emma, Olivia")),
    ntf("stu_priya", "08T16:00", "session_confirmed", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      confirmedText("Tue, Nov 10 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Sam, Emma, Olivia")),
    ntf("stu_sam", "08T16:00", "session_confirmed", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      confirmedText("Tue, Nov 10 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Priya, Emma, Olivia")),
    ntf("stu_emma", "08T16:00", "session_confirmed", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      confirmedText("Tue, Nov 10 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Priya, Sam, Olivia")),
    ntf("stu_olivia", "08T16:00", "session_confirmed", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      confirmedText("Tue, Nov 10 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Priya, Sam, Emma")),
    // Nov 9 3:00 PM: CHEM Wed slot locks with 7 pickers -> tables of 4 and 3
    ntf("stu_hannah", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 4", 1, "Lucia, Ben, Grace")),
    ntf("stu_lucia", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 4", 1, "Hannah, Ben, Grace")),
    ntf("stu_ben", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 4", 1, "Hannah, Lucia, Grace")),
    ntf("stu_grace", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 4", 1, "Hannah, Lucia, Ben")),
    ntf("stu_kai", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 5", 2, "Ethan, Tyler")),
    ntf("stu_ethan", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 5", 2, "Kai, Tyler")),
    ntf("stu_tyler", "09T15:00", "session_confirmed", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      confirmedText("Wed, Nov 11 · 3:00 PM", "Benson Building 2nd floor", "table 5", 2, "Kai, Ethan")),
    // Nov 9 7:00 PM: STAT Wed slot locks
    ntf("stu_jake", "09T19:00", "session_confirmed", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      confirmedText("Wed, Nov 11 · 7:00 PM", "Tanner Building atrium", "table 3", 1, "Tyler, Noah")),
    ntf("stu_tyler", "09T19:00", "session_confirmed", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      confirmedText("Wed, Nov 11 · 7:00 PM", "Tanner Building atrium", "table 3", 1, "Jake, Noah")),
    ntf("stu_noah", "09T19:00", "session_confirmed", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      confirmedText("Wed, Nov 11 · 7:00 PM", "Tanner Building atrium", "table 3", 1, "Jake, Tyler")),
    // Nov 10 3:30 PM: Still coming? (STAT Tue)
    ntf("stu_maya", "10T15:30", "still_coming", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "Still coming? Your study session starts at 4:00 PM at HBLL 3rd floor, table 12."),
    ntf("stu_priya", "10T15:30", "still_coming", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "Still coming? Your study session starts at 4:00 PM at HBLL 3rd floor, table 12."),
    ntf("stu_sam", "10T15:30", "still_coming", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "Still coming? Your study session starts at 4:00 PM at HBLL 3rd floor, table 12."),
    ntf("stu_emma", "10T15:30", "still_coming", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "Still coming? Your study session starts at 4:00 PM at HBLL 3rd floor, table 12."),
    ntf("stu_olivia", "10T15:30", "still_coming", true, "#/session/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "Still coming? Your study session starts at 4:00 PM at HBLL 3rd floor, table 12."),
    // Nov 10 5:30 PM: STAT Tue ends
    ntf("stu_maya", "10T17:30", "post_session", true, "#/after/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "How did it go? Tell us whether today's session left you more prepared."),
    ntf("stu_priya", "10T17:30", "post_session", true, "#/after/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "How did it go? Tell us whether today's session left you more prepared."),
    ntf("stu_olivia", "10T17:30", "post_session", true, "#/after/ses_" + SES_A, "slt_" + S121_M1_TUE, "ses_" + SES_A,
      "How did it go? Tell us whether today's session left you more prepared."),
    // Nov 11 2:30 PM: Still coming? (CHEM Wed, both tables)
    ntf("stu_hannah", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 4."),
    ntf("stu_lucia", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 4."),
    ntf("stu_ben", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 4."),
    ntf("stu_kai", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 5."),
    ntf("stu_ethan", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 5."),
    ntf("stu_tyler", "11T14:30", "still_coming", true, "#/session/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      "Still coming? Your study session starts at 3:00 PM at Benson Building 2nd floor, table 5."),
    // Nov 11 4:30 PM: CHEM Wed ends (Tyler confirmed but never checked in: his miss comes 24h later)
    ntf("stu_hannah", "11T16:30", "post_session", true, "#/after/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "How did it go? Tell us whether today's session left you more prepared."),
    ntf("stu_lucia", "11T16:30", "post_session", true, "#/after/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "How did it go? Tell us whether today's session left you more prepared."),
    ntf("stu_ben", "11T16:30", "post_session", true, "#/after/ses_" + SES_C1, "slt_" + C105_M1_WED, "ses_" + SES_C1,
      "How did it go? Tell us whether today's session left you more prepared."),
    ntf("stu_kai", "11T16:30", "post_session", true, "#/after/ses_" + SES_C2, "slt_" + C105_M1_WED, "ses_" + SES_C2,
      "How did it go? Tell us whether today's session left you more prepared."),
    // Nov 11 6:30 PM: Still coming? (STAT Wed)
    ntf("stu_jake", "11T18:30", "still_coming", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      "Still coming? Your study session starts at 7:00 PM at Tanner Building atrium, table 3."),
    ntf("stu_tyler", "11T18:30", "still_coming", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      "Still coming? Your study session starts at 7:00 PM at Tanner Building atrium, table 3."),
    ntf("stu_noah", "11T18:30", "still_coming", true, "#/session/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      "Still coming? Your study session starts at 7:00 PM at Tanner Building atrium, table 3."),
    // Nov 11 8:30 PM: STAT Wed ends
    ntf("stu_jake", "11T20:30", "post_session", true, "#/after/ses_" + SES_B, "slt_" + S121_M1_WED, "ses_" + SES_B,
      "How did it go? Tell us whether today's session left you more prepared."),
    // Nov 12 4:30 PM: CHEM Wed's 24h window closes (Tyler's CHEM miss); 8:30 PM: STAT Wed's (Tyler, Noah).
    // Each is the student's 1st miss in that class, so each gets the gentle notice.
    ntf("stu_tyler", "12T16:30", "miss_notice", true, "#/me", null, null, missText("CHEM 105")),
    ntf("stu_tyler", "12T20:30", "miss_notice", false, "#/me", null, null, missText("STAT 121")),
    ntf("stu_noah", "12T20:30", "miss_notice", false, "#/me", null, null, missText("STAT 121")),
    // Nov 14 4:00 PM: STAT Mon (cycle 2) locks with 3
    ntf("stu_maya", "14T16:00", "session_confirmed", false, "#/session/ses_" + SES_D, "slt_" + S121_M2_MON, "ses_" + SES_D,
      confirmedText("Mon, Nov 16 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Priya, Olivia")),
    ntf("stu_priya", "14T16:00", "session_confirmed", false, "#/session/ses_" + SES_D, "slt_" + S121_M2_MON, "ses_" + SES_D,
      confirmedText("Mon, Nov 16 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Olivia")),
    ntf("stu_olivia", "14T16:00", "session_confirmed", true, "#/session/ses_" + SES_D, "slt_" + S121_M2_MON, "ses_" + SES_D,
      confirmedText("Mon, Nov 16 · 4:00 PM", "HBLL 3rd floor", "table 12", 1, "Maya, Priya"))
  ];

  SB.seed = {
    version: 3,
    seq: 100,
    jobs: { surveyOpenSent: false },
    demo: { now: t("16T12:00"), currentUserId: null, location: "in_range", pendingLinkCode: null },

    settings: {
      pilotEnd: t("30T12:00"), // PLACEHOLDER
      lockHoursBefore: 48, minGroup: 3, maxPerTable: 6,
      lowTurnoutHoursBefore: 3, confirmMinutesBefore: 30, checkInOpensMinutesBefore: 15,
      checkInRadiusM: 150, postWindowHours: 24, slotWindowDays: 5,
      earlyConfirmAfterMisses: 2, earlyConfirmAskHoursBefore: 24, earlyConfirmByHoursBefore: 3
    },
    admins: [
      { id: "adm_ella", name: "Ella Cook", email: "ella.cook@byu.edu" }, // PLACEHOLDER email
      { id: "adm_ash", name: "Ash Park", email: "ash.park@byu.edu" }     // PLACEHOLDER email
    ],

    // PLACEHOLDER courses, exams, slots and spots
    courses: [
      { id: "crs_stat121", name: "STAT 121: Principles of Statistics", section: "003", linkCode: "stat121-003", enrolled: 180 },
      { id: "crs_chem105", name: "CHEM 105: General College Chemistry", section: "002", linkCode: "chem105-002", enrolled: 150 }
    ],
    exams: [
      { id: "exm_stat121_m1", courseId: "crs_stat121", name: "Exam 2", at: t("12T10:00") },
      { id: "exm_chem105_m1", courseId: "crs_chem105", name: "Midterm 2", at: t("13T10:00") },
      { id: "exm_stat121_m2", courseId: "crs_stat121", name: "Exam 3", at: t("20T10:00") },
      { id: "exm_chem105_m2", courseId: "crs_chem105", name: "Midterm 3", at: t("20T14:00") }
    ],
    slots: [
      { id: "slt_" + S121_M1_MON, examId: "exm_stat121_m1", start: t("09T12:00"), end: t("09T13:30"), place: "HBLL 3rd floor",
        spots: ["table 12"], vibe: "quiet", status: "dropped", jobs: { lockDone: true } },
      { id: "slt_" + S121_M1_TUE, examId: "exm_stat121_m1", start: t("10T16:00"), end: t("10T17:30"), place: "HBLL 3rd floor",
        spots: ["table 12", "table 13"], vibe: "quiet", status: "locked", jobs: { lockDone: true } },
      { id: "slt_" + S121_M1_WED, examId: "exm_stat121_m1", start: t("11T19:00"), end: t("11T20:30"), place: "Tanner Building atrium",
        spots: ["table 3", "table 4"], vibe: "chatty", status: "locked", jobs: { lockDone: true } },
      { id: "slt_" + C105_M1_MON, examId: "exm_chem105_m1", start: t("09T18:00"), end: t("09T19:30"), place: "Wilkinson Center 3rd floor",
        spots: ["table 7"], vibe: "chatty", status: "dropped", jobs: { lockDone: true } },
      { id: "slt_" + C105_M1_WED, examId: "exm_chem105_m1", start: t("11T15:00"), end: t("11T16:30"), place: "Benson Building 2nd floor",
        spots: ["table 4", "table 5"], vibe: "quiet", status: "locked", jobs: { lockDone: true } },
      { id: "slt_" + S121_M2_MON, examId: "exm_stat121_m2", start: t("16T16:00"), end: t("16T17:30"), place: "HBLL 3rd floor",
        spots: ["table 12", "table 13"], vibe: "quiet", status: "locked", jobs: { lockDone: true } },
      { id: "slt_" + S121_M2_WED, examId: "exm_stat121_m2", start: t("18T13:00"), end: t("18T14:30"), place: "Tanner Building atrium",
        spots: ["table 3", "table 4"], vibe: "chatty", status: "open", jobs: { lockDone: false } },
      { id: "slt_" + S121_M2_THU, examId: "exm_stat121_m2", start: t("19T19:00"), end: t("19T20:30"), place: "HBLL 3rd floor",
        spots: ["table 12", "table 13"], vibe: "quiet", status: "open", jobs: { lockDone: false } },
      { id: "slt_" + C105_M2_WED, examId: "exm_chem105_m2", start: t("18T13:30"), end: t("18T15:00"), place: "Benson Building 2nd floor",
        spots: ["table 4"], vibe: "quiet", status: "open", jobs: { lockDone: false } },
      { id: "slt_" + C105_M2_THU, examId: "exm_chem105_m2", start: t("19T16:00"), end: t("19T17:30"), place: "Benson Building 2nd floor",
        spots: ["table 4", "table 5"], vibe: "quiet", status: "open", jobs: { lockDone: false } },
      { id: "slt_" + C105_M2_EVE, examId: "exm_chem105_m2", start: t("19T19:30"), end: t("19T21:00"), place: "Wilkinson Center 3rd floor",
        spots: ["table 7"], vibe: "chatty", status: "open", jobs: { lockDone: false } }
    ],

    conductText: // PLACEHOLDER
      "Prepd code of conduct\n\n" +
      "1. Show up when you say you will. If plans change, tap Can't make it so your group knows. No hard feelings.\n" +
      "2. Respect your table's type: quiet tables stay quiet, chatty tables keep it about the class.\n" +
      "3. Be kind. No harassment, pressure or unwanted contact, during or after a session.\n" +
      "4. Keep it about studying. No selling, recruiting or dating requests.\n" +
      "5. Report anything that made you feel unsafe or uncomfortable. Reports are private and reviewed within 24 hours.\n\n" +
      "If you say you're still coming and then don't show, that's a miss. Misses reset each exam. After 2 misses in one " +
      "exam, you'll confirm a little earlier so your group can count on a full table.",

    ads: [ // PLACEHOLDER sample ads (D42). Every business is made up.
      { id: "ad_owl", business: "Night Owl Cookie Co.", text: "Studying late? Warm cookies delivered until 2 AM.",
        offer: "Free cookie with any order after 9 PM. Show this card." },
      { id: "ad_bagel", business: "Sunrise Bagel Bar", text: "Exam-day breakfast, ready in 3 minutes.",
        offer: "$1 off any bagel sandwich before 11 AM." },
      { id: "ad_print", business: "Corner Copy & Print", text: "Study guides, flash cards and posters, two blocks from campus.",
        offer: "5¢ a page for students all exam week." },
      { id: "ad_boba", business: "Steep & Study Tea House", text: "Quiet tables, outlets everywhere, and real boba.",
        offer: "Buy one, get one half off with a study group of 3 or more." }
    ],

    surveys: { // PLACEHOLDER questions
      intake: [
        { id: "q_in_connect", text: "Do you know someone in this class to study with?", type: "yesno", isConnection: true },
        { id: "q_in_distracted", text: "How often do you get distracted when you study alone? (1 = never, 5 = almost always)", type: "scale5" },
        { id: "q_in_hours", text: "How many hours a week do you study for this class?", type: "choice", options: ["0–2", "3–5", "6–9", "10 or more"] },
        { id: "q_in_notes", text: "Anything else we should know? (optional)", type: "text" }
      ],
      exit: [
        { id: "q_ex_connect", text: "Do you know someone in this class to study with?", type: "yesno", isConnection: true },
        { id: "q_ex_focus", text: "Compared with studying alone, how focused were you at Prepd sessions? (1 = much less, 5 = much more)", type: "scale5" },
        { id: "q_ex_again", text: "Would you use Prepd again next semester?", type: "choice", options: ["Yes", "Maybe", "No"] },
        { id: "q_ex_comment", text: "What should we change? (optional)", type: "text" }
      ]
    },

    students: [ // PLACEHOLDER people
      stu("maya", "Maya", "Sophomore", "quiet", ["crs_stat121", "crs_chem105"]),
      stu("jake", "Jake", "Freshman", "chatty", ["crs_stat121"]),
      stu("priya", "Priya", "Junior", "quiet", ["crs_stat121"]),
      stu("tyler", "Tyler", "Sophomore", "chatty", ["crs_stat121", "crs_chem105"]),
      stu("hannah", "Hannah", "Freshman", "quiet", ["crs_chem105"]),
      stu("sam", "Sam", "Senior", "quiet", ["crs_stat121"]),
      stu("lucia", "Lucia", "Sophomore", "chatty", ["crs_chem105"]),
      stu("ben", "Ben", "Junior", "quiet", ["crs_chem105"]),
      stu("emma", "Emma", "Freshman", "quiet", ["crs_stat121", "crs_chem105"]),
      stu("noah", "Noah", "Sophomore", "chatty", ["crs_stat121"]),
      stu("grace", "Grace", "Junior", "quiet", ["crs_chem105"]),
      stu("kai", "Kai", "Freshman", "chatty", ["crs_chem105"]),
      stu("olivia", "Olivia", "Senior", "quiet", ["crs_stat121"]),
      stu("ethan", "Ethan", "Sophomore", "quiet", ["crs_chem105"]),
      stu("lily", "Lily", "Freshman", "quiet", ["crs_chem105"]),
      stu("zoe", "Zoe", "Freshman", "chatty", ["crs_stat121"],
        { profile: true, conduct: false, intake: false, permissions: false })
    ],

    picks: [
      // cycle 1, STAT Mon (dropped)
      pick(S121_M1_MON, "priya", "04T10:00", "not_placed"),
      pick(S121_M1_MON, "sam", "04T11:00", "not_placed"),
      // cycle 1, STAT Tue
      pick(S121_M1_TUE, "maya", "04T09:00", "placed"),
      pick(S121_M1_TUE, "priya", "04T09:30", "placed"),
      pick(S121_M1_TUE, "sam", "04T10:30", "placed"),
      pick(S121_M1_TUE, "emma", "05T14:00", "placed"),
      pick(S121_M1_TUE, "olivia", "06T08:00", "placed"),
      // cycle 1, STAT Wed
      pick(S121_M1_WED, "jake", "05T12:00", "placed"),
      pick(S121_M1_WED, "tyler", "05T13:00", "placed"),
      pick(S121_M1_WED, "noah", "06T09:00", "placed"),
      // cycle 1, CHEM Mon (dropped)
      pick(C105_M1_MON, "lily", "05T16:00", "not_placed"),
      // cycle 1, CHEM Wed (7 pickers -> 4 + 3, by pick time)
      pick(C105_M1_WED, "hannah", "05T09:00", "placed"),
      pick(C105_M1_WED, "lucia", "05T09:30", "placed"),
      pick(C105_M1_WED, "ben", "05T10:00", "placed"),
      pick(C105_M1_WED, "grace", "05T10:30", "placed"),
      pick(C105_M1_WED, "kai", "05T11:00", "placed"),
      pick(C105_M1_WED, "ethan", "05T11:30", "placed"),
      pick(C105_M1_WED, "tyler", "05T12:00", "placed"),
      // cycle 2, STAT Mon (locked with 3)
      pick(S121_M2_MON, "maya", "12T14:00", "placed"),
      pick(S121_M2_MON, "priya", "12T15:00", "placed"),
      pick(S121_M2_MON, "olivia", "13T09:00", "placed"),
      // cycle 2, STAT Wed (open, 4 picks, locks at 1:00 PM today)
      pick(S121_M2_WED, "jake", "12T18:00", "active"),
      pick(S121_M2_WED, "noah", "13T10:00", "active"),
      pick(S121_M2_WED, "sam", "13T11:00", "active"),
      pick(S121_M2_WED, "maya", "14T09:00", "active"),
      // cycle 2, STAT Thu (open; Emma removed hers)
      pick(S121_M2_THU, "priya", "13T12:00", "active"),
      pick(S121_M2_THU, "olivia", "13T13:00", "active"),
      pick(S121_M2_THU, "emma", "13T14:00", "removed"),
      // cycle 2, CHEM Wed (open, 2 picks, drops at 1:30 PM today)
      pick(C105_M2_WED, "grace", "13T16:00", "active"),
      pick(C105_M2_WED, "ethan", "13T17:00", "active"),
      // cycle 2, CHEM Thu (open, 8 picks -> two tables of 4)
      pick(C105_M2_THU, "hannah", "12T09:00", "active"),
      pick(C105_M2_THU, "lucia", "12T09:30", "active"),
      pick(C105_M2_THU, "ben", "12T10:00", "active"),
      pick(C105_M2_THU, "kai", "12T11:00", "active"),
      pick(C105_M2_THU, "tyler", "12T12:00", "active"),
      pick(C105_M2_THU, "emma", "13T15:00", "active"),
      pick(C105_M2_THU, "maya", "14T10:00", "active"),
      pick(C105_M2_THU, "ethan", "14T11:00", "active"),
      // cycle 2, CHEM Thu evening (open, 1 pick)
      pick(C105_M2_EVE, "lucia", "14T12:00", "active")
    ],

    sessions: [
      { id: "ses_" + SES_A, slotId: "slt_" + S121_M1_TUE, table: 1, spot: "table 12", jobs: allJobs() },
      { id: "ses_" + SES_C1, slotId: "slt_" + C105_M1_WED, table: 1, spot: "table 4", jobs: allJobs() },
      { id: "ses_" + SES_C2, slotId: "slt_" + C105_M1_WED, table: 2, spot: "table 5", jobs: allJobs() },
      { id: "ses_" + SES_B, slotId: "slt_" + S121_M1_WED, table: 1, spot: "table 3", jobs: allJobs() },
      { id: "ses_" + SES_D, slotId: "slt_" + S121_M2_MON, table: 1, spot: "table 12", jobs: todayJobs() }
    ],

    seats: [
      seat(SES_A, "maya", "attended", "10T15:35"),
      seat(SES_A, "priya", "attended", "10T15:40"),
      seat(SES_A, "sam", "released"),
      seat(SES_A, "emma", "cancelled", null, "10T15:40", "cant_make_it"),
      seat(SES_A, "olivia", "attended", "10T15:32"),
      seat(SES_C1, "hannah", "attended", "11T14:31"),
      seat(SES_C1, "lucia", "attended", "11T14:33"),
      seat(SES_C1, "ben", "attended", "11T14:40"),
      seat(SES_C1, "grace", "cancelled", null, "10T20:00", "student"),
      seat(SES_C2, "kai", "attended", "11T14:50"),   // D18: checked in without confirming
      seat(SES_C2, "ethan", "released"),
      seat(SES_C2, "tyler", "no_show", "11T14:35"),
      seat(SES_B, "jake", "attended", "11T18:31"),
      seat(SES_B, "tyler", "no_show", "11T18:35"),
      seat(SES_B, "noah", "no_show", "11T18:40"),
      seat(SES_D, "maya", "placed"),
      seat(SES_D, "priya", "placed"),
      seat(SES_D, "olivia", "cancelled", null, "15T10:00", "student")
    ],

    checkins: [
      chk(SES_A, "maya", "10T15:50", "in_range"),
      chk(SES_A, "priya", "10T15:55", "in_range"),
      chk(SES_A, "olivia", "10T16:02", "in_range"),
      chk(SES_C1, "hannah", "11T14:50", "in_range"),
      chk(SES_C1, "lucia", "11T14:55", "in_range"),
      chk(SES_C1, "ben", "11T14:58", "unverified"),   // waiting for admin review
      chk(SES_C2, "kai", "11T14:50", "in_range"),
      chk(SES_C2, "tyler", "11T14:52", "out_of_range"), // D33: failed attempt, never retried
      chk(SES_B, "jake", "11T18:50", "in_range")
    ],

    misses: [ // given when each session's 24h window closed (D36)
      { id: "mis_tyler_chem", studentId: "stu_tyler", seatId: "set_" + SES_C2 + "_tyler", examId: "exm_chem105_m1",
        at: t("12T16:30"), removed: false },
      { id: "mis_tyler_stat", studentId: "stu_tyler", seatId: "set_" + SES_B + "_tyler", examId: "exm_stat121_m1",
        at: t("12T20:30"), removed: false },
      { id: "mis_noah_stat", studentId: "stu_noah", seatId: "set_" + SES_B + "_noah", examId: "exm_stat121_m1",
        at: t("12T20:30"), removed: false }
    ],
    reports: [],

    postAnswers: [
      { seatId: "set_" + SES_A + "_maya", answer: "more", studiedWith: ["stu_priya", "stu_olivia"], at: t("10T18:00") },
      { seatId: "set_" + SES_A + "_priya", answer: "same", studiedWith: ["stu_maya", "stu_olivia"], at: t("10T19:00") },
      { seatId: "set_" + SES_C1 + "_hannah", answer: "more", studiedWith: ["stu_lucia"], at: t("11T17:00") }, // not Ben: rejecting his check-in still demos a miss
      { seatId: "set_" + SES_C1 + "_lucia", answer: "more", studiedWith: ["stu_hannah"], at: t("11T17:10") },
      { seatId: "set_" + SES_C1 + "_ben", answer: "same", studiedWith: [], at: t("11T17:30") },
      { seatId: "set_" + SES_C2 + "_kai", answer: "same", studiedWith: [], at: t("11T18:00") },
      { seatId: "set_" + SES_B + "_jake", answer: "less", studiedWith: [], at: t("11T21:00") }
    ],
    surveyAnswers: [
      intake("maya", "no", 4, "3–5", "02T10:00"),
      intake("jake", "yes", 3, "0–2", "02T11:00"),
      intake("priya", "no", 5, "6–9", "02T12:00"),
      intake("tyler", "yes", 4, "0–2", "02T13:00"),
      intake("hannah", "no", 4, "3–5", "02T14:00"),
      intake("sam", "no", 2, "3–5", "02T15:00"),
      intake("lucia", "yes", 3, "6–9", "03T09:00"),
      intake("ben", "no", 5, "3–5", "03T10:00"),
      intake("emma", "no", 4, "3–5", "03T11:00"),
      intake("noah", "no", 3, "0–2", "03T12:00"),
      intake("grace", "no", 4, "6–9", "03T13:00"),
      intake("kai", "yes", 2, "3–5", "03T14:00"),
      intake("olivia", "no", 5, "10 or more", "03T15:00"),
      intake("ethan", "no", 4, "3–5", "03T16:00"),
      intake("lily", "no", 5, "3–5", "04T09:00")
    ],

    notifications: notifications
  };

  // Hand-computed from the seed above (see the comments for each count). Values are num / den; NPS is in points.
  function m(num, den, scale) { return { num: num, den: den, value: den === 0 ? null : (num / den) * (scale || 1) }; }
  SB.seedExpectedMetrics = {
    overall: {
      signupConversion: m(18, 330),   // 8 STAT + 10 CHEM finished sign-ups (Zoe unfinished) / 180 + 150
      matchRate: m(14, 15),           // 15 students with a placed/not_placed pick; only Lily was never placed
      showUpRate: m(8, 11),           // confirmed at start: Tue 3, Wed 3, CHEM 5; valid check-ins: 3 + 1 + 4 (Ben's unverified counts)
      repeatUse: null,                // Still open #7
      betterPrepared: m(3, 7),        // "more": Maya, Hannah, Lucia of 7 answers
      connection: m(0, 0),            // no exit answers before the pilot end date
      noShowRate: m(3, 11),           // Tyler x2, Noah / 11 ever-confirmed seats
      nps: m(0, 0, 100)               // no NPS answers yet
    },
    byCourse: {
      crs_stat121: {
        signupConversion: m(8, 180), matchRate: m(8, 8), showUpRate: m(4, 6), repeatUse: null,
        betterPrepared: m(1, 3), connection: m(0, 0), noShowRate: m(2, 6), nps: m(0, 0, 100)
      },
      crs_chem105: {
        signupConversion: m(10, 150), matchRate: m(7, 8), showUpRate: m(4, 5), repeatUse: null,
        betterPrepared: m(2, 4), connection: m(0, 0), noShowRate: m(1, 5), nps: m(0, 0, 100)
      }
    }
  };
})();
