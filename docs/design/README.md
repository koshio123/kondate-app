# 画面デザイン

Claude Design のキャンバス「献立アプリ 画面デザイン」(2026-10-12 確定)の保存版。
スマホ 390×844 基準。色・フォント・UI ルールは [02_design.md「9. 画面デザイン」](../02_design.md) を参照。

実装はこのデザインを元に、その後の機能追加(期間の重なりの警告、再提案シート、献立の削除など)を加えている。
画面の細部が食い違うときは実装が正。

| S0 ログイン | S1 ホーム | S2 計画作成 |
| --- | --- | --- |
| ![S0](screens/s0-login.png) | ![S1](screens/s1-main.png) | ![S2](screens/s2-plan-create.png) |

| S3 余り物入力 | S4 献立提案の確認 | S5 料理詳細 |
| --- | --- | --- |
| ![S3](screens/s3-leftovers.png) | ![S4](screens/s4-proposal.png) | ![S5](screens/s5-dish-detail.png) |

| S6 買い物リスト | S7 お気に入り | S8 設定 |
| --- | --- | --- |
| ![S6](screens/s6-shopping.png) | ![S7](screens/s7-favorites.png) | ![S8](screens/s8-settings.png) |

## ファイル

| パス | 内容 |
| --- | --- |
| `screens/` | 各画面の画像(2倍解像度の PNG) |
| `source/*.dc.html` | 各画面の元データ(Claude Design の形式。表示には Claude Design の実行環境が必要) |
| `source/canvas.json` | キャンバス上の配置と画面名 |
