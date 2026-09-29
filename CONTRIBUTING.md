# Contributing to PawPath

This is KND_04's university project. Keep changes small enough for a teammate to review.

## Start on your PC

1. Clone the repository and open its folder in VS Code.
2. Follow the setup commands in [README.md](README.md).
3. Check that the home page loads and that **Try an example → Predict stay** works.

## Make a change

1. Create a branch, for example `git switch -c feature/better-form`.
2. Edit the files you need. The screen is in `frontend/`; API routes are in
   `main.py`; input checks are in `schemas.py`.
3. Run `node --check frontend/app.js` if you changed JavaScript.
4. Run the checks listed in the README if you changed the API or model handling.
5. Open a pull request on GitHub and ask another group member to review it.

Please do not commit `.venv`, personal data, API tokens, or a replacement model
without agreeing on it as a group. Do not change the saved 30-day classification
rule just to make a demo prediction look different. The model's results can be
wrong, so keep that note visible on the screen.

Good first tasks: improve mobile layout, add accessible form help, make errors
clearer, or add a simple explanation of what input fields mean. Keep the current
prediction working while you make UI changes.
