use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Os {
    Windows,
    MacOs,
    Linux,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Arch {
    X64,
    Arm64,
    Other,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, Serialize, Deserialize)]
pub struct PlatformKey {
    pub os: Os,
    pub arch: Arch,
}

impl PlatformKey {
    pub const fn new(os: Os, arch: Arch) -> Self {
        Self { os, arch }
    }

    pub fn current() -> Self {
        let os = match std::env::consts::OS {
            "windows" => Os::Windows,
            "macos" => Os::MacOs,
            "linux" => Os::Linux,
            _ => Os::Other,
        };
        let arch = match std::env::consts::ARCH {
            "x86_64" => Arch::X64,
            "aarch64" => Arch::Arm64,
            _ => Arch::Other,
        };
        Self { os, arch }
    }

    pub const fn is_supported(self) -> bool {
        matches!(
            (self.os, self.arch),
            (Os::Windows, Arch::X64)
                | (Os::MacOs, Arch::X64)
                | (Os::MacOs, Arch::Arm64)
                | (Os::Linux, Arch::X64)
                | (Os::Linux, Arch::Arm64)
        )
    }
}
