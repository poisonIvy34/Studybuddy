# CLAUDE.md — StudyBuddy BYU MVP prototype

This repo holds a **clickable prototype** of StudyBuddy BYU, built from [PRD.md](PRD.md) (Ella Cook and Ash Park, October 2026).
The PRD is the source of truth for product behavior. This file says how the prototype is built.
If the two disagree, the PRD wins. Point out the conflict instead of picking a side.

## MVP rules

1. **Plain web app.** HTML, CSS and vanilla JavaScript only. No framework, no build step, no npm, no CDN, no installs.
2. **It must open by double-clicking `index.html`** (a `file://` URL). That means:
   - No `fetch()` or XHR. Mock data is a `.js` file that assigns a global.
   - No ES modules (`type="module"` is blocked on `file://`). Use classic `<script>` tags in the order `index.html` gives, and keep everything under one global, `window.SB`.
   - Use hash routing (`#/exams`), never the History API.
3. **Mock data only.** No backend, no real email, no real push, no real GPS. All of these are simulated through the demo panel (see below).
4. **State is saved in `localStorage`** under the key `sb.state.v1`. The first load copies the seed from `js/data.js`. A saved state whose `version` differs from the seed's is replaced by the seed. The demo panel's **Reset** button restores the seed.
5. **Phone-first.** Student screens render in a centered phone-width frame (max 420px). Admin screens use the full width and can stay plain.
6. **All rules live in `js/rules.js`** as pure functions of `(state, now)`. Screens never decide locks, statuses, misses or metrics themselves.
7. **Only `js/store.js` writes state.** Every other file reads state and calls store actions.
8. **Time comes only from the demo clock** (`SB.clock.now()`), never `new Date()` for "now". Times display in Mountain Time (`America/Denver`).
9. **Don't guess.** If the PRD and this file don't answer a question, ask Ella before building it. Put new decisions in [Decisions made for the prototype](#decisions-made-for-the-prototype). Items under **Still open** are not to be built until answered.
10. **Keep what's out of scope out.** Out of scope: the PRD's "Out of scope" table, every "Nice to have" (add-to-calendar, professor dashboard, bring a friend), CSV export, real ads (sample ads are in scope, D42), Sentry or any other monitoring, and the PRD's 90-day data retention.

## Hard product rules (from the PRD — do not change)

**Access and visibility**
- A student joins through a **course link** (one per course section) and signs in with a `@byu.edu` email using a one-time link. Any other email is rejected. Opening another course's link adds that course to the student. A signed-in student can also add any course from a list (D35, which departs from the PRD).
- Before a slot locks, students see **counts only** for each slot, never names.
- After lock, a student sees the **first name and year** of the others at their own table (see D12). Emails are visible only to admins.
- Courses joined, check-ins, misses, "studied with" answers and reports are visible only to admins. They are **never** shown to other students. A student sees their own shown-up record and miss notices only.
- Location is read once, at the tap. Only `in range yes/no` and the time are stored, **never coordinates**.

**Slots, locks and tables** (T = slot start)
- The admin offers candidate slots for each class (D44: slots belong to a class, not an exam; the pilot still runs around an exam crunch). Each slot has a time, a place, a list of booked spots and a type (quiet or chatty).
- A student picks any number of slots. Picking is open until lock.
- **At T−48h the slot locks.**
  - **3 or more pickers:** the slot becomes a session. Pickers are split into `ceil(n / 6)` tables of balanced size, with at most 6 per table. For example, 8 pickers make two tables of 4 (PRD TC5). Each placed student is told "session confirmed" with the time, table and tablemates' first names.
  - **Fewer than 3:** the slot is **dropped**. Each picker is told, and the message suggests the most popular slot for the same exam that hasn't locked yet (see D4).

**Session timeline** (T = session start)
| When | What happens |
| --- | --- |
| T−48h | Lock: form tables or drop the slot (above). |
| T−24h | Students who must confirm early (D39) get "Still coming?". |
| T−3h | Early-confirm students who haven't answered are **released** (no miss). Then, if a session has fewer than 3 students still placed (not cancelled), an alert goes to the admin. Nothing is auto-cancelled. |
| T−30m | Push "Still coming?" with **Still coming** / **Can't make it**. |
| T−15m → end | **I'm here** is available to placed students who haven't cancelled. |
| T | Students who never answered are **released** (no miss). |
| End | Push the post-session question ("Who did you study with?" and how prepared) to students who checked in. |
| End → +24h | The post-session question can be answered. A tablemate naming a student counts as that student attending (D36). |
| End + 24h | Students who said Still coming but were never seen (no valid check-in, nobody named them) become **no-shows** and get a miss (D36). |

**Attendance outcomes**
| Student action | Recorded as | Miss? |
| --- | --- | --- |
| Backed out any time before start (Can't make it) | `cancelled` | No |
| Didn't answer "Still coming?" | `released` (at T, or T−3h for early-confirm seats) | No |
| Said Still coming, then checked in | `attended` | No |
| Said Still coming, didn't check in, a tablemate named them | `attended` (D36) | No |
| Said Still coming, never seen | `no_show` (at End+24h) | Yes |
| Checked in, location denied or failed | `attended`, check-in `unverified`, sent to admin review | Only if the admin rejects it and no tablemate named them |

**Misses** (decided 2026-11-02; these replace the PRD's strikes, warning and 14-day pause, see D36–D40)
- A miss is given only when a student said Still coming and nobody saw them, or when an admin rejects an unverified check-in that no tablemate vouched for. Absence alone is never a miss.
- Nobody is ever asked to name someone who didn't come.
- Each miss sends the student one private, gentle notice. Students see a positive record ("You've shown up to 4 of 4 sessions"), never a count of misses.
- Misses count per class for 14 days after they're given (D45, which replaces D37).
- 2 recent misses in a class: that class's next sessions must be confirmed early (D39). There is no pause.
- Admins can remove any miss.

**Other musts**
- Sign-up happens once: profile (first name, year, quiet or chatty; no photo), code of conduct, intake survey (required), then notification and location permission prompts.
- The post-session question offers exactly: More prepared / About the same / Less prepared. It is preceded by "Who did you study with?" (D36). Afterwards, the student is prompted to pick their next study time.
- Each tablemate row has a **Report a concern** button, for safety and conduct only, never attendance. Reports go to the admin review queue.
- **Delete account** in settings removes the student's data right away.

## Decisions made for the prototype

The PRD left these open. Ella decided them on 2026-10-21.

| # | Question | Decision |
| --- | --- | --- |
| D1 | Student doesn't answer "Still coming?" | Released at start, no miss. |
| D2 | Check-in window | From T−15m until the session ends. |
| D3 | How quiet/chatty works | The admin sets each slot as quiet or chatty. The student's preference **sorts** slots and labels them. It never hides any. |
| D4 | The "nudge" when a slot is dropped | A notification names the most popular slot for the same exam that hasn't locked yet. One tap picks it. It is never picked automatically. |
| D5 | A table falls below 3 after lock | The session goes ahead. The low-turnout alert covers it. |
| D6 | Picking a locked slot | Not allowed. Picking closes at lock. |
| D7 | Low-turnout alert (the PRD says "fewer than 3 confirmed" at T−3h, but confirmations only happen at T−30m) | Count students still placed (not cancelled) at T−3h. |
| D8 | 3rd-strike pause | *Replaced by D39: there is no pause.* |
| D9 | Simulating time, push and GPS | A demo panel with a fake clock, a location toggle, a user switch and Reset. State persists in `localStorage`. |
| D10 | Scope | Student app plus admin console, plus intake and exit surveys and NPS. **No** CSV export (this departs from the PRD's in-scope list) and no professor dashboard. |
| D11 | Unverified check-in | Counts as attended unless an admin rejects it. A rejection makes it `no_show` with a miss, unless a tablemate named the student (D36). |
| D12 | When tablemates are visible | At lock, own table only. |
| D13 | Sign-up conversion denominator | The admin enters an enrollment count on each course. |
| D14 | When the surveys are asked | Intake is required at sign-up. Exit and NPS open on a **pilot end date** that the admin sets. |
| D15 | Where extra tables go | Each slot has a list of booked spots. Table 1 gets the first spot, table 2 the second, and so on. If the list runs out, the admin is alerted. |
| D16 | Post-session question window | Open for 24 hours after the session ends. |
| D17 | Content the PRD leaves open (courses, exams, slots, spots, survey questions, code of conduct) | Realistic placeholders in `js/data.js`, each tagged `PLACEHOLDER`. |
| D18 | A placed student who hasn't confirmed taps I'm here between T−15m and T | The check-in counts as confirming: `confirmedAt` is set to the check-in time and the seat becomes `attended`. They are not released at T. |
| D19 | When Confirm / Can't make it are available | From T−30m until T, for `placed` seats only (early-confirm seats: D39). **Cancel** is available from lock until T, for `placed` or `confirmed` seats. The screen shows both as one **Can't make it** button (D40). |
| D20 | Who gets the post-session question | Students whose seat is `attended` at End, plus anyone who becomes `attended` later because a tablemate named them (D36). |
| D21 | The nudge when the student already picked the most popular slot | Suggest the most popular open slot for that exam that the student has **no active pick** on. If none is left, see Still open #6. |
| D22 | Removing a strike from a paused student | *Replaced: there is no pause (D39). Removing a miss stops it counting; seats already set to confirm early stay that way.* |
| D23 | When the 14-day pause starts | *Replaced: there is no pause (D39). A miss is dated End+24h for a no-show, or the admin's decision time for a rejected check-in.* |
| D24 | Match rate and removed picks | Only picks still active at lock or drop count. A student who removed all their picks before lock is not in the denominator. |
| D25 | How metrics are broken down | Every metric shows a pilot-wide number plus one row per course. |
| D26 | What Delete account removes | Every record tied to the student, deleted right away (see Build conventions). Metrics are recomputed without them, and tablemates stop seeing them. |
| D27 | Report rules | Available from lock until End+24h, on any tablemate at the student's own table, including one who cancelled. Text is optional. |
| D28 | Denying notifications or location at sign-up | Changes nothing. Sign-up continues, banners still show, and only the demo location toggle decides each check-in. |
| D29 | Admin slot rules before lock | A slot outside the 5 days before its exam gets a warning but is allowed. Time, place, spots and type can be edited before lock, and picks are kept. |
| D30 | How pickers are assigned to tables when a slot splits (Still open #4) | By pick time. Pickers are sorted by their active pick's `at` (ties by pick ID). Table 1 is filled first, then table 2, and so on. Table sizes stay balanced: for `n` pickers and `k = ceil(n/6)` tables, the first `n mod k` tables get one extra. |
| D31 | The spot list runs out (Still open #2) | The extra table still forms, with spot `"To be announced"`, and `out_of_spots` goes to `"admin"`. |
| D32 | One student, two locked slots for the same exam (Still open #3) | Placed in both. The same applies to overlapping slots in different courses. The student can cancel either one. |
| D33 | Out-of-range I'm here (Still open #5) | Each failed attempt is stored as a check-in with result `out_of_range`. I'm here stays available until End, and any later valid check-in counts. |
| D34 | Signing in with no course link (Still open #9) | Allowed. A new student signs up as usual, and `#/exams` offers **Add a class** (D35). |
| D35 | Adding a course without its link (decided 2026-11-02; departs from the PRD, where joining is by course link only) | A student who has finished sign-up can add any course from a list at `#/classes`, reached from `#/exams` and `#/me`. Course links still work as before. Removing a course: see D43. |

D36–D40 were decided on 2026-11-02. They replace the PRD's strike system (strikes, 2nd-strike warning, 3rd-strike 14-day pause) with a reliability system that never asks students to report absence.

| # | Question | Decision |
| --- | --- | --- |
| D36 | What counts as attending | A valid check-in **or** being named by a tablemate in "Who did you study with?" (asked with the post-session question; the student taps tablemates' first names). Naming a `confirmed` seat makes it `attended` and sends that student the post-session question. Misses are decided at End+24h, when that window closes. Rejecting an unverified check-in gives no miss if a tablemate named the student. Naming someone who cancelled or was released changes nothing. |
| D37 | When misses reset | Per class. A miss counts until the next exam in the same class opens its study window (that exam's time minus `slotWindowDays`, 5 days). A miss in one class never affects another. |
| D38 | What students see | Each miss sends one private `miss_notice`: the 1st is gentle ("Life happens!…"); one that brings the class to 2 explains confirming early. `#/me` shows "You've shown up to X of Y sessions you said you'd come to" (Y = attended + no-shows whose miss wasn't removed). Never shown to anyone else. |
| D39 | The consequence of 2 recent misses | At lock, a seat whose student has 2+ recent misses in that class gets `earlyConfirm: true` (fixed for that seat). Still coming / Can't make it are available from lock until T−3h; "Still coming?" is sent at T−24h; no answer by T−3h releases the seat with no miss. **There is no pause.** Seats aren't changed afterwards, by later misses or by removing one. "Reliable students placed first" is not built: slots have no seat limit, so nobody is ever left out. |
| D40 | Backing out | One tap on **Can't make it**, no confirmation dialog, with "No problem, we'll let your group know. Thanks for the heads-up!". The others still at the table get `mate_cancelled` naming the student by first name. Never a miss. |
| D41 | The name StudyBuddy is taken (decided 2026-11-06) | The app shows the name **Prepd** everywhere a user sees it. PRD.md and this file keep "StudyBuddy" as the project name. |
| D42 | Sample ads (decided 2026-11-06; departs from the PRD, which keeps ads off in the pilot) | One sample ad for a made-up local business shows below the exams on `#/exams`, always on and labeled "Sample ad". It shows the PRD's "local ads" revenue backup. Ads come from `seed.ads` (PLACEHOLDER), one per MT calendar day, in order. They have no link and record nothing. |

D43–D45 were decided on 2026-11-08, after the tester survey (17 responses). They depart from the PRD, which builds slots, misses and the home screen around exams.

| # | Question | Decision |
| --- | --- | --- |
| D43 | Removing a class | A student can remove a class from `#/me` (with a confirm step). Their `active` picks on that class's slots become `removed` (`removedReason: "student"`). Seats in groups that already formed stay, and the student can still tap Can't make it. Adding the class back is allowed. |
| D44 | Sessions tied to exams | **Not tied to exams.** A slot belongs to a class (`slot.courseId`); there is no `slot.examId`. Exams stay only as dates per class, shown to students as context ("Next exam: Exam 3 · Fri, Nov 20"). The student home (`#/exams`, tab label **Study**) lists the student's sessions, then one card per joined class with its open slots. A dropped slot's suggestion looks at the same **class** (replaces "same exam" in D4/D21). D29's "5 days before the exam" warning is gone: admins add study times to a class on any date. |
| D45 | When misses reset (replaces D37) | A miss counts for `settings.missWindowDays` (14) days after its `at`, per class (`miss.courseId`). |
| D46 | Should misses ever limit picking? (decided 2026-11-08) | **No: accountability over punishment.** Misses never block picking; 2 recent misses in a class only means confirming early (D39). If the pilot's no-show rate goes over 20%, the planned fallback is a cap (2+ recent misses → at most 1 upcoming session in that class), never a pause. The cap is not built. |
| D47 | Same-day sessions on the Study page (decided 2026-11-08) | Sessions on today's MT date that haven't ended show first under **Today**, with Still coming / Can't make it / I'm here on the card, exactly as `seatActions` allows at that moment. Later sessions are under **Coming up**. |

How the prototype reads the PRD (interpretations, not new rules):
- Both Ella and Ash are admins, each with their own account and the same rights.
- "Can't make it" is a cancellation before start, so it gets no miss (PRD TC9).
- The connection question is yes/no: "Do you know someone in this class to study with?" The metric compares the share answering yes in the exit survey with the intake survey, for students who answered both.
- An `out_of_range` check-in is stored but is not a valid check-in, so the seat stays as it was. The student can retry (D33).
- Picking closes at lock (D6), so unpicking does too. Cancelling is only possible before start, so Cancel is hidden from T on.
- A miss counts while `removed` is false and it is less than 14 days old (D45).
- "Students who sign up" (sign-up conversion) means students with that course who have finished all four sign-up steps.
- The exit survey and NPS go to every student who has finished sign-up.
- The 90-day retention rule in the PRD is a pilot policy, not a prototype feature. It is out of scope.

**Still open — ask Ella before building these:**
1. **Conflict:** the PRD asks NPS "once per exam cycle", but D14 opens NPS once, on the pilot end date. Which wins?
2. *Answered → D31.*
3. *Answered → D32.*
4. *Answered → D30.*
5. *Answered → D33.*
6. A dropped slot when no unlocked slot is left for that exam: no suggestion, or a different message?
7. Repeat use: is "a second exam" the next exam in the same course, any later exam, or something else?
8. Product-health metrics (exam-week WAU, link-to-sign-up conversion): are they in the admin metrics? Link conversion would need course-link opens to be recorded.
9. *Answered → D34.*
10. Can admins edit or delete a slot after it locks? Can they cancel a session?
11. Does accepting a Report do anything beyond recording the decision?

## How the app is navigated

Hash routes, handled by `js/router.js`. Guards:
- No current user → `#/signin`, keeping any pending course link in `demo.pendingLinkCode`.
- Sign-up not finished → `#/onboarding/<step>`, at the first unfinished step.
- An admin on a student route → `#/admin/courses`. A student on an admin route → `#/exams`. Admins have no sign-up steps.
- An unknown route → the user's home (`#/exams` or `#/admin/courses`).

**Student**
| Route | Screen |
| --- | --- |
| `#/join/:linkCode` | Course link landing: course name and section, then sign in. Adds the course after sign-in. If the student is already signed in and has finished sign-up, the course is added right away and they go to `#/exams`. If they're signed in but not finished, the course is added and they continue sign-up. An unknown code shows "This link isn't valid" and nothing else. |
| `#/signin` | Email field. A `@byu.edu` email → "Link sent" screen with an **Open link (demo)** button. Any other email → rejected with a message. Tapping **Open link (demo)** signs the user in. An admin's email opens the admin console. A known student's email signs that student in. A new email creates the student record (profile fields `null`) and adds the pending course, if there is one. No notification record is made for sign-in. |
| `#/onboarding/profile` → `conduct` → `intake` → `permissions` | One-time sign-up steps, in order. You can go back but not skip ahead. |
| `#/exams` | Home, labeled **Study** (D44). The student's own sessions (any seat status) at the top, then one card per joined class (sorted by name) with the class's next exam as context and its `open` slots, sorted with the student's preferred type first and then by start time. Each slot shows its pick count, type, place and a pick toggle. Dropped slots, and locked slots where they have no seat, are hidden. One sample ad shows below the classes (D42). |
| `#/session/:id` | A locked session: time, spot, tablemates (first name and year) each with Report a concern, then **Still coming** / **Can't make it** (D40). I'm here is in the check-in bar (below). |
| `#/after/:id` | "Who did you study with?" (tablemates' first names to tap, D36), the post-session question, then a prompt to pick times for the next exam. Open for 24h. |
| `#/me` | The student's own shown-up record (D38) and early-confirm note if any (D39), profile and preference (editable), the student's classes with **Remove** (D43) and **Add a class**, settings, sign out, delete account. |
| `#/classes` | Every course (name and section) with a search box. Courses not yet added have **Add**; added ones show "Added" (D35). |
| `#/survey/exit` | Exit survey plus NPS, available from the pilot end date. |

Student bottom tabs: **Study · Me**. Notifications show as in-app banners at the top. Tapping one goes to its route.

**Check-in bar:** while any of the student's seats has `canCheckIn` (T−15m until End), a bar under the top bar on every student screen shows the session time and place with an **I'm here** button. Tapping it checks in and opens that session, which shows the result.

**Banners:** banners show the current user's unread notifications, newest first, at most 3 at a time. Admins see the notifications addressed to `"admin"`. Tapping a banner marks it read and goes to its route. A close button (×) marks it read without moving. The two admins share one read flag on each admin notification.

**Admin tabs:** **Courses · Review · Misses · Metrics**, along the top, at full width.

**Admin** (shown when the current user is an admin)
| Route | Screen |
| --- | --- |
| `#/admin/courses` | Courses (name, section, link code, enrollment), each with its study times (slots) and its exam dates (context only, D44), with create and edit. Also the **Admin inbox** (low-turnout and out-of-spots alerts). |
| `#/admin/slot/:id` | One slot: pick count, lock result, tables, and each student's status, confirmation (and whether they must confirm early), check-in result and who named them. |
| `#/admin/review` | Queue of unverified check-ins and reports, each with Accept / Reject. |
| `#/admin/misses` | Misses per student, each marked as counting this exam or reset, the student's shown-up record and recent misses per class, with Remove. |
| `#/admin/metrics` | The six pilot metrics, plus no-show rate and NPS. |

**Demo panel** (always visible and **not part of the product**; it starts as a small collapsed "Demo" tab at the top right, opens downward, and folds away on phones after a clock jump, so it never covers the app's tabs)
- **Clock:** shows the fake "now" in MT. Buttons: +15m, +1h, +1 day, and for a chosen slot "Jump to" Lock (T−48h) / T−24h / T−3h / T−30m / T−15m / T / End / End+24h. The clock only moves forward, except through Reset. A "Jump to" target that is already past is disabled.
- **Location:** In range / Out of range / Denied. This decides the result of the next I'm here tap.
- **User:** switch to any mock student or admin.
- **Reset:** reloads the seed data.

Each clock change calls `SB.store.advance(newNow)`, which runs `SB.rules.tick` to apply every time-based transition between the old "now" and the new one. These transitions are locks, drops, alerts, confirmation pushes, releases, post-session pushes, no-shows and misses. They are applied in time order. Running `tick` twice must not repeat any effect. See [Timeline engine](#timeline-engine) for the signature, the job flags and how ties are ordered.

## Data contract

`js/data.js` sets `window.SB.seed`, which has the shape below. `localStorage` holds the same shape. Field names are fixed; adding a field means updating this section first.

- IDs are strings with a prefix (`stu_`, `adm_`, `crs_`, `exm_`, `slt_`, `pck_`, `ses_`, `set_`, `chk_`, `mis_`, `rpt_`, `ntf_`, `ad_`).
  - New IDs come only from `SB.rules.nextId(state, prefix)`. It increments `state.seq` and returns `prefix + seq`, for example `"ntf_57"`. There are no random IDs, so tests are repeatable.
  - Seed IDs are hand-written and readable, for example `"slt_stat121_mon"`.
- Times are ISO 8601 strings with an offset, e.g. `"2026-11-17T16:00:00-07:00"`.
  - New times always come from `SB.clock`, which writes the correct MT offset: −06:00 before Nov 1, 2026, and −07:00 from then on.
- Nullable fields are written `| null`.
- Survey answers are stored by question type:
  - `yesno` → `"yes"` or `"no"`;
  - `scale5` → a number from 1 to 5;
  - `choice` → the exact option string;
  - `text` → a string, which may be empty.
  - Every intake question needs an answer, except `text` questions.

```js
SB.seed = {
  version: 4,                       // bump when this shape changes; older saved states are replaced by the seed
  seq: number,                      // last number used by nextId; the seed sets it above every seeded number
  jobs: { surveyOpenSent: bool },   // global timeline job: survey_open sent at settings.pilotEnd
  demo: { now: ISO, currentUserId: "stu_…" | "adm_…" | null, location: "in_range" | "out_of_range" | "denied",
          pendingLinkCode: string | null },   // course link opened before sign-in; cleared once the course is added

  settings: {
    pilotEnd: ISO,                                   // PLACEHOLDER; opens exit survey + NPS
    lockHoursBefore: 48, minGroup: 3, maxPerTable: 6,
    lowTurnoutHoursBefore: 3, confirmMinutesBefore: 30, checkInOpensMinutesBefore: 15,
    checkInRadiusM: 150, postWindowHours: 24, missWindowDays: 14,   // D45
    earlyConfirmAfterMisses: 2, earlyConfirmAskHoursBefore: 24, earlyConfirmByHoursBefore: 3   // D39
  },
  admins: [{ id: "adm_…", name: string, email: string }],   // Ella, Ash; @byu.edu emails, so they can sign in at #/signin

  courses: [{ id: "crs_…", name: string, section: string, linkCode: string, enrolled: number }],  // PLACEHOLDER
  exams:   [{ id: "exm_…", courseId: "crs_…", name: string, at: ISO }],                           // PLACEHOLDER; context only (D44)
  slots:   [{
    id: "slt_…", courseId: "crs_…", start: ISO, end: ISO,   // D44: a slot belongs to a class, not an exam
    place: string,                  // e.g. "HBLL 3rd floor"
    spots: [string],                // booked tables, in order: ["table 12", "table 13"]
    vibe: "quiet" | "chatty",
    status: "open" | "locked" | "dropped",
    jobs: { lockDone: bool }
  }],

  conductText: string,                              // PLACEHOLDER
  ads: [{ id: "ad_…", business: string, text: string, offer: string }],   // PLACEHOLDER; sample ads for fictional businesses (D42)
  surveys: { intake: [Question], exit: [Question] }, // PLACEHOLDER; one question per survey has isConnection: true
  // Question = { id: string, text: string, type: "yesno" | "scale5" | "choice" | "text", options?: [string], isConnection?: boolean }

  students: [{
    id: "stu_…", email: string, firstName: string | null,                  // null until the profile step
    year: "Freshman" | "Sophomore" | "Junior" | "Senior" | "Grad" | null,
    vibe: "quiet" | "chatty" | null,
    courseIds: ["crs_…"],
    onboarding: { profile: bool, conduct: bool, intake: bool, permissions: bool }
  }],

  picks: [{
    id: "pck_…", slotId: "slt_…", studentId: "stu_…", at: ISO,
    status: "active" | "removed" | "placed" | "not_placed",   // at lock or drop, every active pick becomes placed or not_placed (a dropped slot's picks are all not_placed)
    removedReason: "student" | null
  }],                               // unpicking marks the pick removed; picking again creates a new pick, so a student has at most one active pick per slot

  sessions: [{                      // one per table of a locked slot
    id: "ses_…", slotId: "slt_…", table: number, spot: string,
    jobs: { earlyAskSent: bool, lowTurnoutSent: bool, earlyReleaseDone: bool, confirmSent: bool,
            startDone: bool, endDone: bool, finalDone: bool }
  }],

  seats: [{                         // a student's place at one session
    id: "set_…", sessionId: "ses_…", studentId: "stu_…",
    status: "placed" | "confirmed" | "cancelled" | "released" | "attended" | "no_show",
    confirmedAt: ISO | null, cancelledAt: ISO | null,  // confirmedAt = when they said Still coming
    cancelReason: "student" | "cant_make_it" | null,
    earlyConfirm: bool              // D39: set at lock; must answer by T−3h
  }],

  checkins: [{
    id: "chk_…", seatId: "set_…", at: ISO,
    result: "in_range" | "out_of_range" | "unverified",   // no coordinates, ever
    adminDecision: "accepted" | "rejected" | null         // only for unverified
  }],

  misses:  [{ id: "mis_…", studentId, seatId, courseId, at: ISO, removed: boolean }],   // counts for 14 days in its class (D45)
  reports: [{ id: "rpt_…", sessionId, byStudentId, aboutStudentId, text: string, at: ISO, adminDecision: "accepted" | "rejected" | null }],

  postAnswers:   [{ seatId, answer: "more" | "same" | "less", studiedWith: ["stu_…"], at: ISO }],   // studiedWith: tablemates named (D36)
  surveyAnswers: [{ studentId, kind: "intake" | "exit", answers: { [questionId]: string | number }, nps: number | null, at: ISO }],

  notifications: [{
    id: "ntf_…", to: "stu_…" | "admin", at: ISO, read: boolean, route: string,
    kind: "session_confirmed" | "slot_dropped" | "still_coming" | "post_session"
        | "miss_notice" | "mate_cancelled" | "survey_open" | "low_turnout" | "out_of_spots",
    slotId: "slt_…" | null, sessionId: "ses_…" | null,
    suggestedSlotId: "slt_…" | null,     // only for slot_dropped
    text: string
  }]
}
```

**Seed requirements.**
- Set `demo.now` partway through a midterm cycle, so some slots have locked, some sessions are in the past, and the metrics show real numbers. Put every seeded time in November 2026, so every offset is −07:00.
- Set `demo.currentUserId` to `null` and `demo.pendingLinkCode` to `null`.
- Set every `jobs` flag to match `demo.now`. A job whose time has passed is `true`, and its effects (seats, misses, notifications) are in the seed.
- Include at least 2 courses with 2 exams each (so repeat use can be shown), more example classes (one with no exams, D44), about 15 students, and both admins (Ella and Ash).
- Include slots in every state:
  - one open slot about 49h out with 3+ picks, so it locks in the demo;
  - one open slot about 49h out with 2 picks, so it drops;
  - one open slot with 7+ picks, so it splits into two tables;
  - a locked session about 4h out with 2 students, for the low-turnout alert.
- Include one student with 1 miss, one with 2 misses, and one with an unverified check-in waiting for review.
- Make the data internally consistent:
  - every `attended` seat has a check-in;
  - every `no_show` seat has a miss unless that miss was removed;
  - every `studiedWith` entry names a tablemate;
  - every `placed` pick has a seat.
  - The "locked session about 4h out with 2 students" was locked with 3 or more, and the others cancelled afterwards.
- `js/data.js` also sets `SB.seedExpectedMetrics`, the hand-computed result of `SB.rules.metrics(SB.seed)`, both overall and per course. This is test data, not state, so it never goes into `localStorage`.

**Metrics** (`SB.rules.metrics(state)`, using the PRD's definitions)
- `metrics` returns `{ overall: {…}, byCourse: { [courseId]: {…} } }` (D25).
  - A seat, pick or post-session answer belongs to its slot's course.
  - A survey answer or NPS score counts once for every course the student has joined.
  - Each value is `{ num, den, value }`. `value` is `null` when `den` is 0.
- **Sign-up conversion** (per course) = students with that course who have finished all four sign-up steps ÷ `course.enrolled`.
- **Match rate** = students with at least one `placed` pick ÷ students with at least one `placed` or `not_placed` pick. Removed picks never count (D24).
- **Show-up rate** = seats with valid attendance ÷ seats confirmed at session start (`confirmedAt` set and not cancelled before start). Valid attendance is a valid check-in or being named by a tablemate (D36).
- **Repeat use**: see Still open #7. Don't build it until that's answered. Until then, `metrics` returns `repeatUse: null`, and the admin screen shows the tile as "Waiting on a decision".
- **Better prepared** = `more` ÷ all post-session answers.
- **Connection** = the share answering yes to the exit connection question, minus the share answering yes to the intake one, for students who answered both.
- **No-show rate** = `no_show` seats ÷ seats that were ever confirmed.
- **NPS** = % of answers scoring 9–10 minus % scoring 0–6.
- A **valid check-in** is `in_range`, or `unverified` that an admin has not rejected.

## Timeline engine

`SB.rules.tick(state, now) → state`
- It takes the old "now" from `state.demo.now` and returns a new state with `demo.now = now`.
- It applies every due job in the range (old now, now], using the flags below. A job whose flag is already `true` is skipped, which is why running `tick` twice repeats nothing.
- Jobs whose time is the same are run in this order:
  1. Final (End+24h)
  2. End
  3. T (start)
  4. T−30m
  5. Early release (T−3h)
  6. Low turnout (T−3h)
  7. Early ask (T−24h)
  8. Lock
  9. Pilot end
- The order makes misses settle before any slot locks, so a lock sees the final recent-miss counts (D39), and frees early-confirm seats before the low-turnout count.
- Ties within one job type are broken by slot start, then by ID.

| Job | Time | Flag | Effect |
| --- | --- | --- | --- |
| Lock | slot start − 48h | `slot.jobs.lockDone` | Form tables or drop the slot. Active picks become `placed` or `not_placed`. Each seat's `earlyConfirm` is set from recent misses (D39). Send `session_confirmed`, or `slot_dropped` with its suggestion. Tables are formed by D30. If spots run out, the table still forms with spot "To be announced" and `out_of_spots` is sent (D31). |
| Early ask | T − 24h | `session.jobs.earlyAskSent` | Send `still_coming` to every `placed` seat with `earlyConfirm`. |
| Early release | T − 3h | `session.jobs.earlyReleaseDone` | `placed` seats with `earlyConfirm` → `released` (no miss). |
| Low turnout | T − 3h | `session.jobs.lowTurnoutSent` | If fewer than 3 seats are `placed` or `confirmed`, send `low_turnout` to `"admin"`. |
| Still coming? | T − 30m | `session.jobs.confirmSent` | Send `still_coming` to every `placed` seat. |
| Start | T | `session.jobs.startDone` | `placed` seats → `released`. |
| End | slot end | `session.jobs.endDone` | Send `post_session` to `attended` seats (D20). |
| Final | slot end + 24h | `session.jobs.finalDone` | `confirmed` seats with no valid attendance → `no_show` plus a miss and its `miss_notice` (D36, D38). |
| Pilot end | `settings.pilotEnd` | `state.jobs.surveyOpenSent` | Send `survey_open` to every student who has finished sign-up. |

**Rule details** (`rules.js` follows these exactly)
- **Seat actions.** `SB.rules.seatActions(state, now, seatId)` returns `{ canConfirm, canCantMakeIt, canCancel, canCheckIn, canReport }`. Screens show buttons only from this result.
  - Confirm / Can't make it: D19, or D39 for an `earlyConfirm` seat.
  - Cancel: D19.
  - I'm here: from T−15m until End, for `placed` or `confirmed` seats.
  - Report: D27.
- **Check-in** takes the demo location:
  - `in_range` → result `in_range`, and the seat becomes `attended`;
  - `denied` → result `unverified`, the seat becomes `attended`, and the check-in goes to admin review;
  - `out_of_range` → the result is stored, the seat is unchanged, and the student can retry (D33);
  - a `placed` seat also gets `confirmedAt` set to the check-in time (D18).
- **Rejecting an unverified check-in.** Unless a tablemate named the student, the seat becomes `no_show` and a miss is given at the decision time (D11, D36).
- **Who did you study with?** `answerPost(seatId, answer, studiedWith)`. Every ID must be a tablemate at the student's own table (not themselves). Each named `confirmed` seat → `attended`, and that student gets `post_session` (D36).
- **Backing out.** `cantMakeIt` and `cancel` send `mate_cancelled` to every other `placed` or `confirmed` seat at the table (D40).
- **Drop suggestion.** Look at `open` slots for the same class (D44) where this student has no active pick (D21). Pick the one with the most active picks. Break ties by earliest start, then by ID. If none is found, set `suggestedSlotId: null` (Still open #6).
- **Misses.** A miss is recent while it isn't removed and `now` is before its `at` plus `missWindowDays` (D45). Each new miss sends one `miss_notice` (D38). There is no pause.
- **Removing a class.** `removeCourse(courseId)`: see D43.
- **Delete account** removes every record tied to the student, in one action:
  - the student;
  - their picks, seats and misses;
  - check-ins and post-session answers for their seats, and their ID from others' `studiedWith`;
  - reports they made or that are about them;
  - their survey answers;
  - notifications addressed to them.
  - Then the user is signed out.
  - Sessions stay, even if one is left with fewer students.
- **Purity.** Every rule function deep-copies the state it is given (`JSON.parse(JSON.stringify(state))`) and returns the copy. It never changes its input and never reads `SB.clock.now()` or `SB.store`.

## Module APIs

These are the only cross-file entry points. A builder must not add another without updating this list first.

- Store actions read "now" from `SB.clock.now()`, call the matching rule, save, then notify subscribers.
- Every store action returns `{ ok: true }` or `{ ok: false, error: string }`. The `error` is plain text a screen can show.

**`SB.clock`** (MT, `America/Denver`)
- `now()` returns `SB.store.get().demo.now`.
- `toMs(iso)`
- `fromMs(ms) → ISO` with the correct MT offset.
- `add(iso, { minutes, hours, days })`
- `fmt(iso, "time" | "day" | "dayTime" | "full")`, for example "4:00 PM", "Mon, Nov 16", "Mon, Nov 16 · 4:00 PM".

**`SB.store`**
- Loading and state: `load()`, `get()` (read-only), `subscribe(fn)`, `reset()`.
- Clock: `advance(newNow)`.
- Demo panel: `setLocation(v)`, `switchUser(id | null)`.
- Sign-in:
  - `setPendingLink(code)`;
  - `requestLink(email)` (validates the email only);
  - `openLink(email)`;
  - `joinCourse(linkCode)`;
  - `signOut()`.
- Sign-up: `saveProfile({ firstName, year, vibe })`, `acceptConduct()`, `submitIntake(answers)`, `finishPermissions()`.
- Student: `addCourse(courseId)` (D35), `removeCourse(courseId)` (D43), `pick(slotId)`, `unpick(slotId)`, `confirm(seatId)`, `cantMakeIt(seatId)`, `cancel(seatId)`, `checkIn(seatId)`, `report(sessionId, aboutStudentId, text)`, `answerPost(seatId, answer, studiedWith)`, `submitExit(answers, nps)`, `deleteAccount()`.
- Notifications: `markRead(notificationId)`.
- Admin:
  - `saveCourse(course)`, `saveExam(exam)`, `saveSlot(slot)`, which create when `id` is missing and edit otherwise. Edits are allowed only before lock (D29, Still open #10).
  - `setPilotEnd(iso)`.
  - `decideCheckin(checkinId, "accepted" | "rejected")`, `decideReport(reportId, "accepted" | "rejected")`, `removeMiss(missId)`.

**`SB.rules`** (pure; `tests.html` calls these directly)
- Timeline and IDs: `tick(state, now)`, `nextId(state, prefix)`.
- Transitions: one per store action, with the same name and arguments, after `(state, now, userId)`. They return `{ state, error? }`.
- Reads:
  - `studyFor(state, now, studentId)` → `{ sessions, classes: [{ course, nextExam, slots }], noCourses }`, which already applies the sorting and hiding rules for `#/exams` (D44);
  - `nextExam(state, courseId, now)` → the class's next exam or `null` (context only);
  - `slotCount(state, slotId)`;
  - `canPick(state, now, studentId, slotId)`;
  - `seatActions(state, now, seatId)`;
  - `tablemates(state, now, seatId)`, which returns `{ studentId, firstName, year }` only;
  - `recentMisses(state, now, studentId, courseId)`, `isRecentMiss(state, now, missId)` (D45);
  - `reliability(state, studentId)` → `{ shownUp, promised }` (D38);
  - `postOpen(state, now, seatId)`, `surveyOpen(state, now)`;
  - `metrics(state)`.

**`SB.ui`**
- `h(tag, attrs, ...children)`
- `card(...children)`
- `button(label, onClick, { kind: "primary" | "secondary" | "danger", disabled })`
- `empty(text)`
- `field(label, input)`

**`SB.router`**
- `register(pattern, renderFn)`
- `go(hash)`
- `render()`
- `start()`, which listens for `hashchange` and draws the first screen.

A route with no registered view shows a "Not built yet" card, so the guards and tabs still work before the views exist.

Each view file registers its own routes. A render function receives `(params, mountEl)`.

**`SB.notify`**
- `render()`, which draws the banners into `#banners`.

**`SB.demo`**
- `render()`, which draws the drawer into `#demo`.

## File layout

Each file has one owner and one job. If a change touches another file's job, make it in that file.

| File | Owner | Owns (the only place this lives) |
| --- | --- | --- |
| `index.html` | Ella | Page shell, mount points (`#app`, `#banners`, `#demo`) and the script load order |
| `css/app.css` | Ella | Shared styles: phone frame, cards, buttons, tab bars, banners, admin tables, demo drawer |
| `css/views/<screen>.css` | Ella | Styles used by one screen file only, e.g. `css/views/exams.css` for `js/views/exams.js`. Every rule is prefixed with that screen's root class (e.g. `.v-exams`), so screens can't restyle each other. |
| `js/data.js` | Ella | Mock seed data and every `PLACEHOLDER` content item |
| `js/clock.js` | Ella | The demo "now" and all time formatting and math in Mountain Time |
| `js/store.js` | Ella | Loading, saving and resetting state, and every action that changes state |
| `js/rules.js` | Ella | Pure rules: timeline `tick`, locking and table splitting, drops and suggestions, seat transitions, check-in validity, attendance, misses, sorting, visibility, metrics |
| `js/notify.js` | Ella | Drawing notifications as in-app banners and marking them read |
| `js/router.js` | Ella | Route matching, guards, the student and admin tab bars, and the student check-in bar. Views register their own routes with `SB.router.register`. |
| `js/ui.js` | Ella | Small DOM helpers (`h()`, card, button, empty state). No business logic. |
| `js/views/signin.js` | Ella | Course link landing, sign-in and link-sent screens |
| `js/views/onboarding.js` | Ella | The four sign-up steps |
| `js/views/exams.js` | Ella | Exam view with slot picking, and the session screen (Still coming, Can't make it, tablemates, report a concern) |
| `js/views/after.js` | Ella | "Who did you study with?", the post-session question, and the exit survey with NPS |
| `js/views/me.js` | Ella | Shown-up record, profile, preference, settings, delete account, and the `#/classes` list (D35) |
| `js/views/admin.js` | Ella | All admin screens |
| `js/demo.js` | Ella | The demo panel: clock, location, user switch, reset |
| `js/main.js` | Ella | Startup: load the store, start the router, draw the first screen |
| `tests.html` | Ella | Rule checks. Opens by double-click and prints pass/fail to the page. |

**Build groups** (when the build is split across subagents, each group owns only these files):
| Group | Files |
| --- | --- |
| Data layer | `js/data.js`, `js/clock.js`, `js/store.js`, `js/rules.js`, `tests.html` |
| App shell | `index.html`, `css/app.css`, `js/ui.js`, `js/router.js`, `js/notify.js`, `js/demo.js`, `js/main.js` |
| Views | One subagent per screen file: `js/views/<screen>.js` plus `css/views/<screen>.css`, for `signin`, `onboarding`, `exams`, `after`, `me`, `admin` |

Script order in `index.html`: `data → clock → store → rules → notify → ui → router → views/* → demo → main`. `tests.html` loads `data, clock, rules` only. Stylesheets load `css/app.css` first, then `css/views/*.css` in the same order as the view scripts.

Notification records are created by `rules.js`, as part of `tick` and of the transitions. `notify.js` only draws them. This keeps `tick` pure and testable without `notify.js`.

## How we check it works

1. **Double-click `index.html`** in Chrome and in Edge. The app loads with no console errors, and works with no network connection.
2. **Open `tests.html`.** Every rule check passes. The checks cover at least:
   - each row of the attendance table;
   - lock with 3+, lock with 8 (two tables of 4), and drop with 2 plus its suggestion;
   - D1, D2, D5–D7, D11 and D36–D40;
   - the gentle miss notice, the per-class reset, and confirming early after 2 misses;
   - running `tick` twice;
   - every metric against hand-computed seed values.
3. **Walk the happy path with the demo panel:**
   - open a course link, sign in, finish sign-up, pick slots and watch the counts change;
   - jump to Lock and see "session confirmed" with tablemates;
   - jump to T−30m and tap Still coming, then jump to T−15m with In range and tap I'm here in the check-in bar;
   - jump to End, name a tablemate in "Who did you study with?" and answer the post-session question;
   - check that both show as attended in the admin slot view (the tablemate with "Named by").
4. **Walk the failure paths:**
   - a slot with 2 picks drops at Lock, and the suggestion picks another slot in one tap;
   - Can't make it is one tap, and the rest of the table gets a notice;
   - an unanswered Still coming? is released at T, with no miss;
   - Still coming but never seen stays pending until End+24h, then becomes a no-show plus a gentle miss notice;
   - Denied location gives an unverified check-in, which appears in the review queue. Reject it and see the miss;
   - a session with 2 students at T−3h appears in the Admin inbox.
5. **Check privacy:**
   - before lock, slots show only counts;
   - after lock, a student sees only their own table's first names and years;
   - no student screen ever shows an email, a miss count, a check-in result, a "studied with" answer or a report about another student;
   - `localStorage` contains no coordinates.
6. **Reload and Reset.** A reload keeps state. Reset brings back the seed exactly.
