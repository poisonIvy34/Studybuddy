# StudyBuddy BYU — Product Requirements Document

**Ella Cook and Ash Park · October 2026**

> **Pitch:** StudyBuddy matches BYU students with classmates from the same course to study together in person before each exam.

| 71% | 57% | 62% | 57% |
| :---: | :---: | :---: | :---: |
| wanted a study partner last month and had no one | would go if others were from their own class | worry about sitting with strangers | would use it mainly around exams |

*Figures from our survey of 21 BYU students, Oct 13–20, 2026.*

---

## 1. Problem (why)

Students study better with someone beside them, but most study alone: 81% of surveyed BYU students did under a quarter of their study time with anyone else, and 43% get distracted often or almost always when alone. In the past month, 71% wanted a study partner and had no one.

The causes are practical, not a lack of motivation. Friends are on different schedules (67%, the top barrier) or in different classes, students don't know people in their own courses, and messaging a classmate out of nowhere feels awkward. Class group chats exist, but they're for logistics; nobody uses them to say "want to study for the midterm together?" The need also comes in waves: it peaks in the days before an exam, then disappears.

> **The product's job:** give classmates a shared, low-pressure reason to study together (the same upcoming exam) and make the logistics of when and where automatic.

## 2. Users (who)

| Role | Who | What they need |
| --- | --- | --- |
| **Student (primary user)** | BYU sophomores and juniors in large lower-division courses (stats, chem, econ, intro business); freshmen next | Classmates to study with before an exam, at a time that fits, without awkward asking |
| **Course champion** | Professors and TAs of pilot courses | A zero-effort way to help students prepare: share one link, nothing else to run |
| **Buyer** | BYU's Office of Belonging or CAPS (to be confirmed) | Evidence that students feel more connected and build study habits |
| **Admin** | Ella and Ash | Set up courses and exam dates, book spots, watch attendance and results |

## 3. The bet: opportunity, strategy, solution

| | Our bet |
| --- | --- |
| **Opportunity** | Most students want a study partner before exams but don't have one (71%), and no tool connects classmates in the same course in person. Universities already invest in belonging and student success, so there is a buyer with a budget once results are proven. |
| **Strategy** | Win one campus, one exam at a time. Start with 2–3 large BYU courses, reach students through their professors (a free channel every student already trusts), and focus on exam weeks when demand is highest. Use pilot results to sell a yearly license to BYU, then expand to more courses. |
| **Solution** | A course link professors share; students pick every time they could study before an exam; slots with 3+ classmates become sessions at a reserved campus table; a check-in and one follow-up question measure attendance and whether it helped. |

**How this fits our strategy:** every feature either gets students from the same course to the same table, or produces the evidence (sign-ups, show-ups, connection) we need to win the university as a paying customer. Anything that doesn't do either is skipped for now (section 8).

## 4. Goals and metrics

### Goals

- **Prove demand:** students in a pilot course sign up and show up before an exam.
- **Prove value:** students feel more prepared and more connected after a session.
- **Prove the business:** pilot results convince a BYU office to fund a yearly license.

### Pilot success targets (2–3 courses, one midterm cycle)

| Metric | Exact definition | Target |
| --- | --- | --- |
| Sign-up conversion | Students who sign up ÷ students enrolled in the pilot course | 15% or more |
| Match rate | Students placed in a session ÷ students who picked times | 80% or more |
| Show-up rate | Check-ins ÷ confirmed spots at session start | 60% or more |
| Repeat use | Students who attend before a second exam ÷ students who attended before the first | 40% or more |
| Better prepared | "More prepared" answers ÷ all answers to the post-session question | 70% or more |
| Connection | Students who say they now know someone in the class to study with (exit vs. intake survey) | Any increase |

### Ongoing product health

- **Weekly active students in exam weeks:** students who pick times or attend a session that week (exam-week WAU matters more than daily use, since need comes in waves).
- **Link-to-sign-up conversion:** students who open a course link and finish signing up.
- **NPS:** "How likely are you to recommend StudyBuddy to a classmate?" (0–10), asked once per exam cycle; target +30 or higher.
- **No-show rate:** confirmed students who didn't check in; target under 20%.

## 5. Design research: existing solutions

Students already patch this problem together with four kinds of tools. Each solves part of it; none connects classmates in the same course, in person, before an exam.

| Solution | How it works | What it does well | Where it falls short for our persona | What we take from it |
| --- | --- | --- | --- | --- |
| **Focusmate** | 1-on-1 video sessions (25 or 50 min) with an accountability partner. Free for 3 sessions a week; Plus is $8/month billed annually. | Simple booking; a fixed time and a partner create accountability | Online, not in person; partner isn't a classmate, so no shared exam or relationship | Book a set time in advance; a short, clear session structure |
| **StudyStream** | Free 24/7 Zoom "focus rooms" where up to 1,000 students study silently on camera; over 4 million people had joined by 2021. | Always available; silent rooms reduce awkwardness | Anonymous and global; no one from your class; no help building local connections | Quiet sessions as the default; low social pressure |
| **Class group chats and Discord servers** | Students in a course message each other on GroupMe, Discord or iMessage. | Free; the right people are already there | Used for logistics; asking "want to study?" feels awkward (only 19% of our respondents had done it) | Reach students where the class already is: the professor's course link |
| **BYU tutoring labs and study groups** | Free, campus-run tutoring and subject labs at set times and places. | Content help from trained tutors; trusted and free | Fixed times rarely fit; tutor-led rather than peer study; only 24% of our respondents had used one | Campus locations students know; partner with these offices later |

*Sources: [Focusmate pricing (Lifestack)](https://lifestack.ai/blog/focusmate-pricing); [StudyStream (TechCrunch, Oct 6, 2021)](https://techcrunch.com/2021/10/06/studystream-gives-students-a-place-to-study-live-with-thousands-of-others/); usage figures from our student survey.*

## 6. How user feedback shaped the design

Our first concept matched any BYU students to study side by side every week. Survey feedback from 21 students changed the design in these specific ways:

| What students told us | Evidence | Design change |
| --- | --- | --- |
| Sitting with strangers is awkward | Top worry, 62% | Match only within the same course; show first names and year before meeting |
| They want people from their own class | Top draw, 57% | Professors share a course link; every session is for one course and one exam |
| The need comes around exams | 57% would use it mainly around exams; only 19% weekly | Sessions cluster in the 5 days before each exam instead of running every week |
| Schedules don't line up | Top barrier, 67% | Students pick every time that works; only times with 3+ classmates go ahead |
| Others might not show up | 38% | 30-minute "Still coming?" confirmation, location check-in, no-show strikes, minimum group of 3 |
| Split on quiet vs. chatty | Quiet 33%, chatty 24% | Quiet or chatty preference at sign-up; tables labeled by type |
| They won't pay | Median "bargain" price $1/month; no one chose to pay | Free for students; BYU pays a license; local ads as a backup |

## 7. Designs: core flow and wireframes

**Sessions are proposed times, not fixed classes:** the admin offers 6–10 time slots in the 5 days before each exam, and only slots with enough interested students go ahead. That avoids empty rooms without forcing one schedule on everyone.

1. **Admin sets up a course:** course name, section, exam dates, and candidate slots (for example "Mon 4–6pm, HBLL 3rd floor, table 12").
2. **Professor shares the link** in Learning Suite or Canvas, or announces it in class.
3. **Student signs up** with a BYU email and picks quiet or chatty (screen 1).
4. **Student picks every time that works,** seeing how many classmates picked each slot, never names (screen 2).
5. **Slots lock 48 hours ahead.** A slot with 3+ students becomes a session (max 6 per table; a second table opens past 6). Slots under 3 are dropped, and those students are nudged to the most popular remaining slot (screen 3).
6. **Confirm and check in:** a "Still coming?" push 30 minutes before, then an "I'm here" location check-in at the table (screen 4).
7. **Afterward:** one question, "Do you feel more prepared than studying alone?", then a prompt to pick times for the next exam.

![Screens 1–2: join from the course link, pick every time that works](wf1.png)

![Screens 3–4: session confirmed, check in and one question](wf2.png)

*Low-fidelity wireframes of the four main student screens.*

## 8. Requirements

### In scope: must have for the pilot

- **Course link sign-up:** one link per course section; @byu.edu email sign-in with a one-time link; joining adds the student to that course.
- **Profile:** first name, year, quiet or chatty preference. No photo required.
- **Exam view:** upcoming exams for each of the student's courses, with the candidate slots before each one.
- **Slot picking:** select any number of slots; see a count of classmates per slot, never names, until it locks.
- **Auto-lock and grouping:** 48 hours before a slot, 3+ students become a session (max 6 per table, extra tables as needed); under 3 is dropped with a nudge to the most popular slot left.
- **Notifications (push):** session confirmed, 30-minute "Still coming?", slot dropped, post-session question.
- **Check-in:** "I'm here" button, location read once, within 150 m of the spot; if location fails, the check-in is marked unverified and goes to admin review.
- **No-shows:** a strike only when a student confirmed and didn't check in; a warning at 2 strikes; 3 strikes pause sign-ups for 14 days; admin can remove strikes.
- **Post-session question:** More prepared / About the same / Less prepared.
- **Safety:** code of conduct at sign-up, Report button, account deletion.
- **Admin console (web):** create courses, exam dates and slots; see sign-ups, locks and attendance; review queue; CSV export; the metrics in section 4.

### Nice to have

- Add-to-calendar on a locked session.
- Professor dashboard showing anonymous sign-up and attendance counts for their course.
- Bring a friend from the same course.

### Out of scope: what we're skipping and why

| Skipped for now | Why |
| --- | --- |
| Campus-wide matching with strangers | Students told us strangers are the top worry |
| Weekly sessions outside exam periods | Demand is concentrated around exams |
| Tutoring or content help | BYU tutoring labs already do this; we focus on peer study |
| Messaging between students | Adds safety and moderation work; time, place and names are enough to meet |
| Integration with Learning Suite, Canvas or BYU sign-in | A shared link works today; integration needs BYU approval |
| Rewards, raffles and ads | Not needed to prove demand; ads need BYU approval |
| Virtual sessions and other universities | The bet is in-person connection at one campus first |

## 9. Architecture

A small, standard stack that two students can build and run without BYU systems.

| Component | What it does | Built with |
| --- | --- | --- |
| Student app | Sign-up, slot picking, sessions, check-in, post-session question | React Native (Expo), one codebase for iPhone and Android |
| Backend and database | Accounts, courses, slots, sessions, check-ins, strikes | Supabase (Postgres database, email-link sign-in, row-level security) |
| Scheduled jobs | Lock slots 48 hours ahead, form groups, send confirmations, low-turnout alerts | Supabase scheduled functions (cron) |
| Notifications | Push and email (sign-in links, confirmations, reminders) | Expo push notifications; a transactional email service |
| Admin console | Course and slot setup, review queue, metrics, CSV export | Small web app on the same backend |
| Monitoring | Crash and error tracking, usage events for metrics | Sentry for errors; event table in the database for metrics |

### Data and privacy

| Data | Source | Who sees it |
| --- | --- | --- |
| BYU email | Student, at sign-in | Only admin |
| First name, year, quiet/chatty | Student profile | Classmates in the same locked session |
| Courses joined | Course link | Only admin; professors see counts, never names |
| Slot picks | Student | Classmates see counts per slot only |
| Check-ins (yes/no + time), strikes, reports | App activity | Only admin |
| Post-session and survey answers | Student | Admin; reported to BYU only in aggregate |

- **Location:** read once at check-in; only "within range: yes/no" is stored, never coordinates.
- **Retention:** personal data deleted 90 days after the pilot; account deletion removes data immediately.

## 10. Risks and assumptions

Our riskiest assumptions, ranked by likelihood and impact, with how we reduce or test each one.

| Risk or assumption | Likelihood | Impact | Consequence if wrong | How we reduce or test it |
| --- | --- | --- | --- | --- |
| Students will meet classmates they don't know yet, even from the same course | Medium | High | No one shows up; the core idea fails | Concierge test before building; first names shown in advance; quiet tables |
| Professors will share the course link | Medium | High | Too few sign-ups to form groups | Start with 2–3 professors we know; zero work for them; a one-paragraph pitch |
| Enough students per course pick the same times | Medium | High | Slots get dropped; students get frustrated | Pick courses with 150+ students; offer fewer slots; test whether pairs of 2 work |
| BYU will pay once results are proven | Medium | High | No revenue; product stays a free side project | Student-first pilot builds evidence; staff outreach started; local ads as a backup |
| Confirmed students actually come | Medium | Medium | People arrive to an empty table and don't return | Confirmation 30 minutes before; strikes; minimum group of 3 |
| Survey results reflect most students | Medium | Medium | Our 21 responses came from friends and group chats and may be biased | Concierge test measures real behavior, not stated interest |
| Study tables are available in exam weeks | Medium | Medium | Sessions have nowhere to meet | Book HBLL group rooms early; a visible StudyBuddy sign at reserved tables |
| Location check-in works indoors | High chance it fails sometimes | Low | Attendance data is incomplete | Unverified check-ins go to admin review instead of failing |
| Students feel safe meeting | Low | High | Harm to students and to trust in the product | BYU email only; first names only; code of conduct; Report button reviewed within 24 hours |

## 11. Business model and go-to-market

**Free for students; BYU pays a yearly license.** No student in our survey chose to pay a fee themselves, and the median "bargain" price was $1 a month, so charging students isn't viable. 38% preferred "free because BYU pays," and BYU offices focused on belonging and wellbeing are the natural budget holders.

**Backup: local ads.** 48% of students preferred a free version with a small ad, and 86% said a local Provo business ad wouldn't bother them. Ads stay off in the pilot and would need BYU's approval.

> **Go-to-market: students first, then the university.** Phase 1 is a free pilot marketed directly to students through professors, group chats and Instagram, to prove students sign up, show up and feel more connected. Phase 2 takes those results to BYU's Office of Belonging and CAPS to set a yearly license price. We have already sent a staff survey to these offices but haven't received responses yet; universities buy on evidence, so the pilot is the sales pitch.

## 12. Test plan

### Step 1: validate before building (concierge test)

This direction comes from survey data but hasn't been tested with students yet. In 1–2 courses, a professor shares a Google Form listing times before the next midterm. We group students by hand and text them the session details, then attend to observe. If fewer than 10% of the class signs up, or fewer than half of those show up, we change the pitch, timing or course before writing code.

### Step 2: test cases for the app

| ID | Scenario | Expected result |
| --- | --- | --- |
| TC1 | Student opens a course link and signs in with an @byu.edu email | Account created and added to that course; non-BYU emails are rejected |
| TC2 | Student picks 3 slots | Counts update for everyone; no names are visible |
| TC3 | A slot has 4 students 48 hours before | Slot locks; all 4 get time, table and first names |
| TC4 | A slot has 2 students 48 hours before | Slot is dropped; both get a nudge to the most popular remaining slot |
| TC5 | A slot has 8 students | Two tables of 4 are created |
| TC6 | Student confirms, then taps "I'm here" within 150 m | Marked attended |
| TC7 | Student confirms but never checks in | Marked no-show with a strike; 3rd strike pauses sign-ups for 14 days |
| TC8 | Location permission is denied at check-in | Check-in saved as unverified and sent to admin review |
| TC9 | Student cancels before the session starts | No strike; spot released; group size updated |
| TC10 | Student answers the post-session question | Answer saved and reflected in admin metrics the same day |

### Step 3: release and monitoring

- **Staged release:** launch in one course first, then add 2 more after the first exam if no critical bugs appear.
- **Daily in exam weeks:** sign-ups per course, slots locked vs. dropped, show-up rate. If a course is under 10% sign-up after 3 days, we contact the professor to re-share the link.
- **Session days:** a low-turnout alert 3 hours before any session with fewer than 3 confirmed; we decide whether to merge or cancel.
- **Technical health:** crash and error alerts (Sentry) and push delivery failures, fixed within 24 hours.
- **Weekly:** NPS, "more prepared" rate, no-show rate, and every safety report reviewed within 24 hours.

> **Go / no-go:** if sign-up and show-up both hit target, expand to more courses and the final exam period, and take results to BYU. If not, change one thing (slot times, group size or how professors share it) and test again with the next exam.

## 13. Open questions

- **Which courses?** Find 2–3 professors of large courses with a midterm in the next few weeks who'll share the link.
- **Who at BYU is the buyer?** Office of Belonging, CAPS, or an academic success office?
- **Where do sessions happen?** Can we reserve HBLL group rooms or tables for exam weeks?
- **Minimum group size:** is 3 right, or would students accept pairs of 2?
- **BYU approvals:** can we use BYU's name, and is IRB review needed if we report results?
