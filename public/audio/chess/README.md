# Chess Sound Effects

This directory is intended to store the chess-related sound effects sourced from [sfxengine.com](https://sfxengine.com/fr/sound-effects/chess).

Because the automated environment that produced this change cannot reach the site (the proxy returns HTTP 403), no audio files are bundled here. Use the helper script below to download them locally and then add the files to the repository.

## Download instructions

1. Ensure you have Python 3.10+ available.
2. (Optional) Create and activate a virtual environment.
3. Install the minimal dependencies:
   ```bash
   python -m pip install --upgrade pip
   ```
   The script only depends on the Python standard library.
4. Run the downloader from the project root:
   ```bash
   python scripts/download_sfxengine_chess.py
   ```
   Use `--dry-run` first if you only want to see which files will be fetched.
5. Verify the downloaded files inside `public/audio/chess/` and add them to version control if desired.

If the download fails due to network restrictions, please retrieve the files manually from the page above and place them in this directory.
