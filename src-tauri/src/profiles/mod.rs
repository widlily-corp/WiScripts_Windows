use crate::error::AppError;
use crate::optimization;
use crate::runner::{CommandRunner, ExecutionSummary};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationProfile {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_name: String,
    pub rule_ids: Vec<String>,
}

/// Returns standard curated 1-click optimization profiles ("gaming", "privacy", "work").
pub fn get_optimization_profiles() -> Vec<OptimizationProfile> {
    vec![
        OptimizationProfile {
            id: "gaming".to_string(),
            name: "Gaming Profile".to_string(),
            description: "Optimizes background services, disables telemetry and bloatware for maximum gaming performance.".to_string(),
            icon_name: "Gamepad2".to_string(),
            rule_ids: vec![
                "services_sysmain".to_string(),
                "bloatware_xbox_apps".to_string(),
                "telemetry_diagtrack".to_string(),
                "telemetry_dmwappush".to_string(),
                "telemetry_ceip_tasks".to_string(),
                "disk_clean_temp".to_string(),
            ],
        },
        OptimizationProfile {
            id: "privacy".to_string(),
            name: "Maximum Privacy".to_string(),
            description: "Hardens system privacy settings by disabling tracking, telemetry, activity logging, and advertising IDs.".to_string(),
            icon_name: "ShieldCheck".to_string(),
            rule_ids: vec![
                "telemetry_diagtrack".to_string(),
                "telemetry_dmwappush".to_string(),
                "telemetry_ceip_tasks".to_string(),
                "privacy_advertising_id".to_string(),
                "privacy_location_tracking".to_string(),
                "privacy_activity_history".to_string(),
                "bloatware_cortana".to_string(),
            ],
        },
        OptimizationProfile {
            id: "work".to_string(),
            name: "Workstation / Productivity".to_string(),
            description: "Cleans temporary cache files, enables file extensions and hidden items in Explorer, and turns off unnecessary background services.".to_string(),
            icon_name: "Briefcase".to_string(),
            rule_ids: vec![
                "disk_clean_temp".to_string(),
                "disk_clean_delivery_optimization".to_string(),
                "services_fax_spooler".to_string(),
                "ui_show_file_extensions".to_string(),
                "ui_show_hidden_files".to_string(),
                "telemetry_diagtrack".to_string(),
            ],
        },
    ]
}

/// Applies a curated 1-click optimization profile by delegating its rule IDs to the optimization engine.
pub fn apply_optimization_profile(
    app: Option<&tauri::AppHandle>,
    runner: &dyn CommandRunner,
    profile_id: &str,
    dry_run: bool,
) -> Result<ExecutionSummary, AppError> {
    let clean_id = profile_id.trim().to_lowercase();
    log::info!(
        "[ProfilesEngine] Applying optimization profile: '{}' (dry_run={})",
        clean_id,
        dry_run || runner.is_dry_run()
    );

    let profiles = get_optimization_profiles();
    let profile = profiles
        .into_iter()
        .find(|p| p.id.eq_ignore_ascii_case(&clean_id))
        .ok_or_else(|| {
            let err_msg = format!("Optimization profile '{}' not found", profile_id);
            log::error!("[ProfilesEngine] {}", err_msg);
            AppError::InvalidConfig(err_msg)
        })?;

    log::info!(
        "[ProfilesEngine] Found profile '{}' with {} rule IDs: {:?}",
        profile.name,
        profile.rule_ids.len(),
        profile.rule_ids
    );

    optimization::execute(app, runner, &profile.rule_ids, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runner::DryRunRunner;

    #[test]
    fn test_get_optimization_profiles() {
        let profiles = get_optimization_profiles();
        assert_eq!(profiles.len(), 3);
        assert_eq!(profiles[0].id, "gaming");
        assert_eq!(profiles[1].id, "privacy");
        assert_eq!(profiles[2].id, "work");
    }

    #[test]
    fn test_apply_optimization_profile_gaming_dry_run() {
        let runner = DryRunRunner::new();
        let summary = apply_optimization_profile(None, &runner, "gaming", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 6);
    }

    #[test]
    fn test_apply_optimization_profile_privacy_dry_run() {
        let runner = DryRunRunner::new();
        let summary = apply_optimization_profile(None, &runner, "privacy", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 7);
    }

    #[test]
    fn test_apply_optimization_profile_work_dry_run() {
        let runner = DryRunRunner::new();
        let summary = apply_optimization_profile(None, &runner, "work", true).unwrap();

        assert!(summary.is_dry_run);
        assert!(summary.success);
        assert_eq!(summary.executed_actions.len(), 6);
    }

    #[test]
    fn test_apply_optimization_profile_invalid_id() {
        let runner = DryRunRunner::new();
        let res = apply_optimization_profile(None, &runner, "non_existent_profile", true);

        assert!(res.is_err());
        if let Err(AppError::InvalidConfig(msg)) = res {
            assert!(msg.contains("Optimization profile 'non_existent_profile' not found"));
        } else {
            panic!("Expected AppError::InvalidConfig");
        }
    }
}
