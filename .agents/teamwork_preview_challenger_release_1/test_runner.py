import sys
import yaml
from pathlib import Path

WORKFLOW_PATH = Path(r"c:\Users\Widlily\Documents\projects\WiScripts_Windows\.github\workflows\release.yml")
TAURI_CONF_PATH = Path(r"c:\Users\Widlily\Documents\projects\WiScripts_Windows\src-tauri\tauri.conf.json")

class WorkflowVerifier:
    def __init__(self, file_path: Path):
        self.file_path = file_path
        self.raw_bytes = file_path.read_bytes()
        self.raw_content = file_path.read_text(encoding="utf-8")
        self.lines = self.raw_content.splitlines()
        self.data = None
        self.errors = []
        self.warnings = []
        self.test_log = []

    def log(self, category: str, test_name: str, passed: bool, detail: str = ""):
        status = "PASS" if passed else "FAIL"
        msg = f"[{category}] [{status}] {test_name}"
        if detail:
            msg += f" - {detail}"
        self.test_log.append((category, status, test_name, detail))
        if not passed:
            self.errors.append(f"[{category}] {test_name}: {detail}")

    def run_task1_static_yaml_parsing(self):
        """Task 1: Run static YAML parsing and validation checks against release.yml."""
        try:
            self.data = yaml.safe_load(self.raw_content)
            if isinstance(self.data, dict):
                self.log("Task 1: Parsing", "YAML Safe Load", True, "Successfully parsed YAML root dict.")
            else:
                self.log("Task 1: Parsing", "YAML Safe Load", False, "Parsed YAML is not a dictionary.")
        except Exception as e:
            self.log("Task 1: Parsing", "YAML Safe Load", False, f"YAML parsing failed: {e}")

        # Check top-level keys
        if self.data:
            # Note: PyYAML 1.1 loads unquoted key 'on' as boolean True
            has_on_key = ('on' in self.data) or (True in self.data)
            self.log("Task 1: Parsing", "Top-level 'name' key", 'name' in self.data, f"Found name: {self.data.get('name')}")
            self.log("Task 1: Parsing", "Top-level 'on' key", has_on_key, "Found trigger 'on' block.")
            self.log("Task 1: Parsing", "Top-level 'jobs' key", 'jobs' in self.data, "Found jobs dictionary.")

    def run_task2_yaml_structure_integrity(self):
        """Task 2: Test YAML structure integrity (tabs, indentation, valid mapping)."""
        # Check tabs in raw bytes and lines
        has_tab = b"\t" in self.raw_bytes
        self.log("Task 2: Integrity", "No Tab Characters", not has_tab, "Zero tab bytes found." if not has_tab else "Tab character detected!")

        # Indentation check
        odd_indents = []
        for idx, line in enumerate(self.lines, 1):
            if "\t" in line:
                odd_indents.append(f"Line {idx} has tabs")
            stripped = line.lstrip(" ")
            indent = len(line) - len(stripped)
            if stripped and not stripped.startswith("#"):
                if indent % 2 != 0:
                    odd_indents.append(f"Line {idx} (indent={indent})")

        self.log("Task 2: Integrity", "2-Space Indentation Consistency", len(odd_indents) == 0, 
                 "All lines follow clean 2-space indentation." if not odd_indents else f"Inconsistent lines: {', '.join(odd_indents)}")

        # Mapping structure check
        if self.data and 'jobs' in self.data:
            jobs = self.data['jobs']
            is_valid_jobs_map = isinstance(jobs, dict) and 'release' in jobs
            self.log("Task 2: Integrity", "Jobs Mapping Validation", is_valid_jobs_map, "jobs.release dictionary is valid.")
        else:
            self.log("Task 2: Integrity", "Jobs Mapping Validation", False, "jobs map missing or invalid.")

    def run_task3_action_inputs_and_env_completeness(self):
        """Task 3: Validate action inputs and env block completeness against tauri-apps/tauri-action@v0 specification."""
        if not self.data or 'jobs' not in self.data or 'release' not in self.data['jobs']:
            self.log("Task 3: Action Spec", "Job Structure", False, "release job not available.")
            return

        release_job = self.data['jobs']['release']
        runs_on = release_job.get('runs-on')
        self.log("Task 3: Action Spec", "Job OS (runs-on)", runs_on == "windows-latest", f"runs-on: {runs_on}")

        permissions = release_job.get('permissions', {})
        self.log("Task 3: Action Spec", "Permissions (contents: write)", permissions.get('contents') == 'write', f"permissions: {permissions}")

        steps = release_job.get('steps', [])
        tauri_step = None
        for step in steps:
            if "tauri-apps/tauri-action" in step.get("uses", ""):
                tauri_step = step
                break

        self.log("Task 3: Action Spec", "Tauri Action Step Present", tauri_step is not None, "Found step with tauri-apps/tauri-action@v0")

        if tauri_step:
            uses = tauri_step.get("uses", "")
            self.log("Task 3: Action Spec", "Tauri Action Version Tag", uses == "tauri-apps/tauri-action@v0", f"uses: {uses}")

            # Env block check
            env = tauri_step.get("env", {})
            has_gh_token = "GITHUB_TOKEN" in env and "${{ secrets.GITHUB_TOKEN }}" in str(env["GITHUB_TOKEN"])
            has_key = "TAURI_SIGNING_PRIVATE_KEY" in env and "${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}" in str(env["TAURI_SIGNING_PRIVATE_KEY"])
            has_pass = "TAURI_SIGNING_PRIVATE_KEY_PASSWORD" in env and "${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}" in str(env["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"])

            self.log("Task 3: Action Spec", "Env: GITHUB_TOKEN", has_gh_token, "GITHUB_TOKEN mapped from secrets.")
            self.log("Task 3: Action Spec", "Env: TAURI_SIGNING_PRIVATE_KEY", has_key, "TAURI_SIGNING_PRIVATE_KEY mapped from secrets.")
            self.log("Task 3: Action Spec", "Env: TAURI_SIGNING_PRIVATE_KEY_PASSWORD", has_pass, "TAURI_SIGNING_PRIVATE_KEY_PASSWORD mapped from secrets.")

            # Inputs (with block) check
            with_block = tauri_step.get("with", {})
            has_tag_name = "tagName" in with_block and "__VERSION__" in str(with_block["tagName"])
            has_release_name = "releaseName" in with_block and "WiScripts" in str(with_block["releaseName"])

            self.log("Task 3: Action Spec", "Input: tagName", has_tag_name, f"tagName: {with_block.get('tagName')}")
            self.log("Task 3: Action Spec", "Input: releaseName", has_release_name, f"releaseName: {with_block.get('releaseName')}")

    def run_task4_draft_prerelease_flags(self):
        """Task 4: Verify that tauri-apps/tauri-action@v0 handles draft/prerelease flags appropriately."""
        if not self.data or 'jobs' not in self.data or 'release' not in self.data['jobs']:
            self.log("Task 4: Flags", "Tauri Action Flags", False, "release job missing.")
            return

        steps = self.data['jobs']['release'].get('steps', [])
        tauri_step = next((s for s in steps if "tauri-apps/tauri-action" in s.get("uses", "")), None)

        if not tauri_step:
            self.log("Task 4: Flags", "Tauri Step", False, "tauri-action step missing.")
            return

        with_block = tauri_step.get("with", {})
        release_draft = with_block.get("releaseDraft")
        prerelease = with_block.get("prerelease")

        is_draft_bool = isinstance(release_draft, bool) and release_draft is False
        is_prerelease_bool = isinstance(prerelease, bool) and prerelease is False

        self.log("Task 4: Flags", "releaseDraft flag", is_draft_bool, f"releaseDraft = {release_draft} (type: {type(release_draft).__name__})")
        self.log("Task 4: Flags", "prerelease flag", is_prerelease_bool, f"prerelease = {prerelease} (type: {type(prerelease).__name__})")

    def run_all(self):
        self.run_task1_static_yaml_parsing()
        self.run_task2_yaml_structure_integrity()
        self.run_task3_action_inputs_and_env_completeness()
        self.run_task4_draft_prerelease_flags()

        print("==================================================")
        print("          EMPIRICAL VALIDATION REPORT             ")
        print("==================================================")
        for cat, status, name, detail in self.test_log:
            print(f"[{status}] [{cat}] {name} - {detail}")
        print("==================================================")

        total_tests = len(self.test_log)
        failed_tests = len(self.errors)
        passed_tests = total_tests - failed_tests

        print(f"Total Tests: {total_tests} | Passed: {passed_tests} | Failed: {failed_tests}")
        verdict = "PASS" if failed_tests == 0 else "FAIL"
        print(f"VERDICT: {verdict}")
        return verdict == "PASS"

if __name__ == "__main__":
    verifier = WorkflowVerifier(WORKFLOW_PATH)
    success = verifier.run_all()
    sys.exit(0 if success else 1)
