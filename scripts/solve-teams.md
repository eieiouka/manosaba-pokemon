# まのさばポケモン 構築解析

Node.js 24以上。ブラウザや外部APIは不要。対戦本体の src/data.js / battle.js / ai.js を使用する。

## まず全構築を絞り込む（PowerShell）

```powershell
node scripts/solve-teams.mjs --quick --opponents 16 --opponent-choices 3 --repeats 4 --workers 8 --out analysis/screen.json
```

13人から6人を選ぶ1716構築、先発を区別し控えの並びを同一視する858通りの3人選出が対象。相手6人構築をランダム抽選し、各相手から指定数の3人選出をサンプルする。

## 上位10構築を深く再検証

```powershell
node scripts/solve-teams.mjs --shortlist analysis/screen.json --top 10 --depth 2 --samples 1 --rollout 1 --opponents 8 --opponent-choices 3 --repeats 4 --workers 8 --out analysis/deep.json
```

さらに深くする場合は --depth 3。分岐数が急増するため、まず --top 1 --opponents 1 --opponent-choices 1 などで所要時間を測る。--samples は各探索節点の乱数サンプル数。

## 保存・再開

計算済みの対戦組み合わせは出力ファイル名+.jsonlに追記される。Ctrl+Cで中断しても、同じコマンドで再開可能。エンジンや条件を変更したら別の --out または --checkpoint を使う。--workers は途中で変更可能。出力JSONの rankings に全構築、score に独立検証乱数での期待成績、trainingScore に選出決定に使った成績、selections に有力な選出順を保存する。引き分けは0.5勝。

## 計算法と限界

- 対戦中の深読みは双方の合法行動の組み合わせを指定深度まで探索し、混合戦略を近似する。
- 選出は相手の6人構築ごとに、学習用対戦成績から双方の混合選出を決める。別の乱数での成績を集計する（repeats 2以上、偶数推奨）。
- --opponent-choices 60 で各相手の全60選出を対象にできる。--opponents 1716 で全相手構築を対象にできるが、非常に大規模な計算になる。
- 乱数サンプル、有限深度、評価関数、控え順の同一視、相手選出のサンプリングによる近似であり、厳密な完全解ではない。深読み対戦中は双方の3人選出を既知として計算する。
- analysis/ は実行時の出力場所。必要な結果だけ保存すること。
