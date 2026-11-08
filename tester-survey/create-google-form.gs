/**
 * Creates the "Prepd: Tester Survey" Google Form.
 *
 * How to use:
 *   1. Go to https://script.google.com and click "New project".
 *   2. Delete the sample code, paste this whole file in, and click Save.
 *   3. Click Run (function: createPrepdSurvey). Allow the permissions Google asks for.
 *   4. Open "Execution log": it prints the link to send testers and the link to edit the form.
 *      The form also appears in your Google Drive.
 *
 * Each step of the test is its own page, so testers do one task, answer, then move on.
 */
function createPrepdSurvey() {
  var form = FormApp.create('Prepd: Tester Survey');
  form.setDescription(
    'Thanks for testing Prepd! Prepd helps college students find a small study group before an exam: ' +
    'you pick study times, and if 3 or more classmates pick the same time, you\'re placed at a table together.\n\n' +
    'This survey walks you through the app one step at a time. Do each step, then answer the questions on that page. ' +
    'It takes about 15 minutes. Keep the app open in another tab or on your phone.\n\n' +
    'Everything in the app is pretend: no real emails are sent and no real location is used. The yellow "Demo" box ' +
    'in the corner is not part of the app. It lets you fast-forward time so you can see a whole study session in a few minutes.'
  );
  form.setProgressBar(true);
  form.setConfirmationMessage('Thank you! Your answers help us decide what to build next.');

  function choice(title, options, required) {
    form.addMultipleChoiceItem().setTitle(title).setChoiceValues(options).setRequired(required !== false);
  }
  function open(title) {
    form.addParagraphTextItem().setTitle(title).setRequired(false);
  }
  function page(title, steps) {
    form.addPageBreakItem().setTitle(title).setHelpText(steps.map(function (s, i) {
      return (i + 1) + '. ' + s;
    }).join('\n'));
  }
  var EASE = ['Very easy', 'Easy', 'Okay', 'Hard', 'Very hard'];

  // About you (first page)
  form.addSectionHeaderItem().setTitle('About you');
  choice('Which best describes you?', ['BYU student', 'Student at another school', 'Not a student']);
  choice('What are you using to test Prepd?', ['Phone', 'Laptop or computer', 'Tablet']);

  page('Step 1: Sign up', [
    'Open Prepd: https://poisonivy34.github.io/Studybuddy/ (in a new tab, or on your phone).',
    'Type any made-up email ending in @byu.edu (for example, yourname@byu.edu) and tap "Email me a sign-in link."',
    'Tap "Open link (demo)," then finish the 4 sign-up screens.',
    'Come back here and answer the questions below.'
  ]);
  choice('How easy was signing up?', EASE);
  open('Was anything on the sign-up screens confusing or annoying? If so, what?');

  page('Step 2: Add a class and pick a study time', [
    'On the Exams tab, tap "+ Add a class" and add STAT 121.',
    'Go back to Exams. Under Exam 3, turn on the time "Wed, Nov 18 · 1:00 PM." Feel free to pick another time too.'
  ]);
  choice('How clear was it what picking a time means?', ['Very clear', 'Somewhat clear', 'Not clear']);
  open('When you looked at the study times, what did you want to know that wasn\'t shown?');

  page('Step 3: Get matched with a study group', [
    'In the yellow Demo box, under "Jump to, for slot," choose the option that includes "Exam 3 · Wed, Nov 18 · 1:00 PM."',
    'Tap "Lock (T−48h)." This fast-forwards to 48 hours before the session, when groups are formed.',
    'Tap the "Session confirmed" message at the top to see your table.'
  ]);
  choice('After the time locked, did you understand what happened?', ['Yes', 'Mostly', 'No']);
  choice('How comfortable would you be meeting a table of classmates you only know by first name and year?',
    ['Very comfortable', 'Somewhat comfortable', 'Not very comfortable', 'Not at all comfortable']);

  page('Step 4: Go to the session', [
    'In the Demo box, tap "T−30m" (30 minutes before). On your session screen, tap "Still coming."',
    'Tap "T−15m." A bar appears at the top of the app: tap "I\'m here" to check in.',
    'Tap "End." Tap the "How did it go?" message and answer the questions in the app.'
  ]);
  choice('How easy were "Still coming" and "I\'m here" to use?', EASE);
  choice('Would you trust an app like this to check you in at a real study table?', ['Yes', 'Maybe', 'No']);
  choice('How did the "Who did you study with?" question feel?', ['Fine', 'A little awkward', 'Uncomfortable']);

  page('Step 5: Look around', [
    'Scroll to the bottom of the Exams tab.',
    'Open the Me tab and look around.'
  ]);
  choice('What did you think of the sample ad at the bottom of the Exams tab?',
    ['I didn\'t notice it', 'Fine, it didn\'t bother me', 'A little annoying', 'Very annoying']);
  choice('If Prepd were real, which would you choose?',
    ['Free, with a small ad from a local business', '$1 a month, with no ads', 'I wouldn\'t use it either way']);
  choice('What do you think of the name "Prepd"?', ['Love it', 'Like it', 'Neutral', 'Don\'t like it']);
  choice('How much do you like the look and colors of the app?', ['Love them', 'Like them', 'Neutral', 'Don\'t like them']);

  page('Overall', ['Almost done! A few last questions about the whole app.']);
  form.addScaleItem()
    .setTitle('How likely are you to recommend Prepd to a friend or classmate?')
    .setBounds(0, 10)
    .setLabels('Not at all likely', 'Extremely likely')
    .setRequired(true);
  choice('If you were a student with an exam coming up, would you use Prepd?',
    ['Definitely', 'Probably', 'Not sure', 'Probably not', 'Definitely not']);
  open('What was the most confusing part of the app?');
  open('What is one thing you would change or add?');
  open('Did anything break or look wrong? Tell us what you were doing when it happened.');
  form.addTextItem()
    .setTitle('Can we follow up with you? If so, leave your email (optional).')
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build())
    .setRequired(false);

  // Newer Google accounts create forms unpublished; publish it so the link works right away.
  try { if (form.setPublished) form.setPublished(true); } catch (e) { /* older API: forms are live by default */ }

  Logger.log('Send this link to testers: ' + form.getPublishedUrl());
  Logger.log('Edit the form here: ' + form.getEditUrl());
}
