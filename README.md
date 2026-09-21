<!--
SPDX-FileCopyrightText: 2026 Deutsche Telekom AG

SPDX-License-Identifier: CC0-1.0
-->

# Zoo Code – T-Systems AI Engineer fork

> **Official documentation:** the original Zoo Code README with all product documentation, installation and usage instructions is maintained upstream at
> **[https://github.com/Zoo-Code-Org/Zoo-Code/blob/main/README.md](https://github.com/Zoo-Code-Org/Zoo-Code/blob/main/README.md)**.
> An unchanged copy is kept on the [`main`](../../tree/main) branch of this fork.

[![REUSE Compliance Check](../../actions/workflows/reuse-compliance.yml/badge.svg)](../../actions/workflows/reuse-compliance.yml)

## About

Zoo Code gives you a whole dev team of AI agents in your code editor (VS Code extension and CLI).

This repository is the T-Systems **AI Engineer (AIE)** fork of [Zoo Code](https://github.com/Zoo-Code-Org/Zoo-Code). The upstream code is kept untouched on the `main` branch; all AIE changes live on the `aie` branch (the default branch of this repository) and are documented below.

## Changes to the official Repository

All changes to the upstream project made in this fork are listed here. Please add a row for every change you make on the `aie` branch.

| Date       | Change                                                                                                                                                                                                    | Where                                                                             | Reason                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 2026-09-21 | REUSE compliance setup from [telekom/reuse-template](https://github.com/telekom/reuse-template): `REUSE.toml`, license texts in `LICENSES/`, REUSE Compliance Check workflow, SPDX header in `.gitignore` | `REUSE.toml`, `LICENSES/`, `.github/workflows/reuse-compliance.yml`, `.gitignore` | Deutsche Telekom OSPO open source publishing requirements |
| 2026-09-21 | Replaced the upstream README with this fork README (link to the official README, change log, Code of Conduct and Licensing sections)                                                                      | `README.md`                                                                       | Document fork changes and licensing                       |
| 2026-09-21 | Replaced the upstream Code of Conduct with the Contributor Covenant 2.1 file from the reuse-template (upstream translations under `locales/*/CODE_OF_CONDUCT.md` are left untouched)                      | `CODE_OF_CONDUCT.md`                                                              | Use the Telekom code of conduct in all AIE repositories   |
| 2026-09-21 | Removed the upstream `CONTRIBUTING.md`, `SECURITY.md` and `PRIVACY.md`; they describe the upstream project's processes and do not apply to this fork                                                      | `CONTRIBUTING.md`, `SECURITY.md`, `PRIVACY.md`                                    | Avoid misleading contributors; T-Systems processes apply  |

## Code of Conduct

This project has adopted the [Contributor Covenant](https://www.contributor-covenant.org/) in version 2.1 as our code of conduct, using the file from [telekom/reuse-template](https://github.com/telekom/reuse-template). Please see the details in our [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). All contributors must abide by the code of conduct.

By participating in this project, you agree to abide by its [Code of Conduct](./CODE_OF_CONDUCT.md) at all times.

## Licensing

Copyright (c) 2026 Deutsche Telekom AG

This repository is a fork of [https://github.com/Zoo-Code-Org/Zoo-Code](https://github.com/Zoo-Code-Org/Zoo-Code). The original work is Copyright (c) 2026 Zoo Code Org and licensed under the [Apache-2.0](./LICENSE) license. Changes made by Deutsche Telekom AG are documented in the section above and are licensed under the same license.

All content in this repository is licensed under at least one of the licenses found in [./LICENSES](./LICENSES); you may not use this file, or any other file in this repository, except in compliance with the Licenses.
You may obtain a copy of the Licenses by reviewing the files found in the [./LICENSES](./LICENSES) folder.

Unless required by applicable law or agreed to in writing, software distributed under the Licenses is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See in the [./LICENSES](./LICENSES) folder for the specific language governing permissions and limitations under the Licenses.

This project follows the [REUSE standard for software licensing](https://reuse.software/).
Each file contains copyright and license information, and license texts can be found in the [./LICENSES](./LICENSES) folder. For more information visit https://reuse.software/.
You can find a guide for developers at https://telekom.github.io/reuse-template/.
