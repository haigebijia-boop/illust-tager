# コンタクトシート — イラストタグ管理ツール（Web版 / GitHub Pages + Firebase + Cloudinary）

これは、Windowsで動かす版とは別の「**サーバーを自分で用意しないWeb版**」です。
GitHub Pages（静的ファイルの無料ホスティング）、Firebase（無料のデータベース・
ログイン機能）、Cloudinary（無料の画像ホスティング）を組み合わせることで、
Pythonサーバーを動かし続けなくても、常時どこからでもアクセスできるギャラリーになります。

- **画像の保存** → Cloudinary
- **タグ・メモなどの情報** → Firebase Firestore（データベース）
- **ログイン（追加・編集・削除の制限）** → Firebase Authentication
- **ページの見た目（HTML/CSS/JS）の置き場所** → GitHub Pages

閲覧は誰でも可能、新規登録・編集・削除はログインしたあなただけができます。

> **画像の保存先について**: 以前はFirebase Storageを使っていましたが、2024年10月以降の
> Firebase仕様変更により、Cloud Storageの利用にはBlazeプラン（従量課金・クレジットカード
> 登録必須）への登録が必要になりました。クレジットカード登録なしで運用するため、画像の
> 保存先はCloudinary（無料プランで開始可能）に変更しています。Firestore・Authentication
> は引き続きBlaze不要（Sparkプラン＝無料）で利用できます。

---

## 全体の流れ

1. Firebaseで無料プロジェクトを作る
2. Firestore・Authentication を有効にする
3. セキュリティルールを設定する（閲覧は誰でも、書き込みは本人だけ）
4. 自分のログイン用アカウントを1つ作る
5. `firebase-config.js` を自分のプロジェクトの値に書き換える
6. Cloudinaryで無料アカウントを作り、unsigned upload presetを作成する
7. `cloudinary-config.js` を自分のCloudinaryアカウントの値に書き換える
8. GitHubリポジトリを作り、このフォルダの中身をアップロードする
9. GitHub Pagesを有効にする

---

## 1. Firebaseプロジェクトを作る

1. https://console.firebase.google.com/ にアクセスし、Googleアカウントでログイン
2. 「プロジェクトを追加」→ 好きなプロジェクト名を入力 → 作成（Googleアナリティクスは無効でOK）

## 2. Firestore Database を有効にする

1. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
2. ロケーションは `asia-northeast1`（東京）など好きな場所を選択
3. 「本番環境モードで開始」を選んで作成
4. 作成後、「ルール」タブを開き、中身を全部消して、同梱の `firestore.rules` の内容を
   貼り付けて「公開」をクリック

## 3. Authentication を有効にし、自分のアカウントを作る

1. 左メニュー「構築」→「Authentication」→「始める」
2. 「Sign-in method」タブで「メール/パスワード」を選び、有効にする
3. 「Users」タブ →「ユーザーを追加」→ 自分用のメールアドレスとパスワードを設定
   （これが、このアプリに追加・編集・削除でログインする時のアカウントになります。
   一般公開の新規登録フォームはこのアプリには用意していません）

## 4. ウェブアプリを登録し、接続情報を取得する

1. プロジェクトの概要ページ →「</>」（ウェブ）アイコンをクリックしてアプリを追加
2. アプリのニックネームを入力して登録（Firebase Hostingは使わないので、そのままでOK）
3. 表示された `firebaseConfig = { apiKey: ..., authDomain: ..., ... }` の中身をコピー
4. このフォルダの `firebase-config.js` を開き、`YOUR_API_KEY` などの部分を、コピーした
   実際の値に書き換えて保存する

> この設定値は「公開されても問題ない」情報です（秘密鍵ではありません）。実際の安全性は
> 手順2で設定したセキュリティルール（ログインしている人だけ書き込み可）で担保されています。

## 5. Cloudinaryで無料アカウントを作り、unsigned upload presetを作成する

1. https://cloudinary.com/users/register/free にアクセスし、無料アカウントを作成
2. ログイン後のダッシュボード（https://console.cloudinary.com/）左上に表示される
   「Cloud name」をメモしておく
3. 左メニュー（歯車アイコン）「Settings」→「Upload」タブを開く
4. 「Upload presets」の項目で「Add upload preset」をクリック
5. 「Signing Mode」を **「Unsigned」** に変更する（これがクライアントから直接
   アップロードするために必須の設定です）
6. 必要であれば preset名をわかりやすいものに変更し、「Save」で保存する
   （保存後に表示される preset名をメモしておく）

## 6. `cloudinary-config.js` を書き換える

このフォルダの `cloudinary-config.js` を開き、`YOUR_CLOUD_NAME` / `YOUR_UPLOAD_PRESET`
の部分を、手順5でメモした「Cloud name」と「preset名」に書き換えて保存する。

> この設定値も「公開されても問題ない」情報です（秘密鍵ではありません）。ただし
> unsigned upload presetの性質については、下記「注意事項」を必ず確認してください。

## 7. GitHubにアップロードする

1. https://github.com/ で新しいリポジトリを作成（Public / Privateどちらでも可。
   ただしGitHub Pagesを無料で使う場合はPublicが簡単です）
2. このフォルダの中身（`index.html` `style.css` `script.js` `firebase-config.js`
   `cloudinary-config.js` など）をリポジトリにアップロードする
   - GitHubの画面から「Add file」→「Upload files」でドラッグ＆ドロップでもOK
   - Gitに慣れていれば `git init` → `git add .` → `git commit` → `git push` でもOK

## 8. GitHub Pagesを有効にする

1. リポジトリの「Settings」タブ →「Pages」
2. 「Build and deployment」の「Source」で「Deploy from a branch」を選択
3. 「Branch」で `main`（または使っているブランチ名）と `/ (root)` を選んで保存
4. しばらく待つと、`https://あなたのユーザー名.github.io/リポジトリ名/` でアクセスできるようになる

---

## 使い方

1. 上記URLを開くと、誰でもギャラリーを閲覧できる
2. 右上の「ログイン」から、手順3で作ったメールアドレス/パスワードでログインする
3. ログインすると「＋ 新しいイラストを登録する」が使えるようになる
4. 画像を選ぶと、色味候補チップが自動で表示される（クリックで追加、または「すべて追加」）
5. 年月・キャラクター・メモなどを入力して「登録する」
6. ギャラリーの画像をクリックすると詳細表示。ログイン中なら編集・削除もできる
7. 上部の検索バーで年・月・キャラクター・色味・キーワードを組み合わせて絞り込み

---

## 無料枠の目安

Firebase（Sparkプラン）・Cloudinaryそれぞれの無料プランの主な上限です。個人のイラスト
保管用途であれば、当面は十分に収まる範囲です。

- Firestore: 1日あたり読み取り5万回・書き込み2万回など
- Authentication: 無料（メール/パスワード認証は無制限）
- Cloudinary（無料プラン）: 保存容量25GB、月間クレジット25（画像の保存・配信量に応じて
  消費）程度が目安（プラン内容は変更される可能性があるため、最新の内容は
  https://cloudinary.com/pricing で確認してください）

画像枚数が増えるなど、将来的に容量が厳しくなってきた場合は、Cloudinaryの有料プランへの
切り替えを検討してください。

## 注意事項・トラブルシューティング

- **unsigned upload presetについて** → このアプリの画像アップロードは、Cloudinaryの
  「unsigned upload preset」を使い、クライアント（ブラウザ）から署名なしで直接
  アップロードする方式です。この方式の性質上、`cloudinary-config.js` の中身
  （cloud name・preset名）さえ知っていれば、このアプリを経由しなくても、原理的には
  第三者があなたのCloudinaryアカウントに画像をアップロードできてしまいます
  （閲覧・ダウンロードや、Firestore上のデータの改ざんはできません）。心配な場合は、
  Cloudinaryのアップロードpreset設定でファイルサイズ上限・許可する形式の制限を
  かけたり、悪用が疑われる場合はpresetを作り直す（無効化する）ことで対処してください
- **画像の削除について** → 詳細画面から削除しても、Firestore上のレコードが消えるだけで、
  Cloudinary上の画像ファイル自体は削除されません（unsigned upload presetだけでは
  削除APIの実行に必要な署名を作れないため）。不要な画像を完全に消したい場合は、
  Cloudinaryのメディアライブラリ（https://console.cloudinary.com/console/media_library）
  から手動で削除してください
- **ギャラリーが「読み込み中...」のまま止まる** → `firebase-config.js` の値が
  正しいか確認してください。ブラウザの開発者ツール（F12）の「Console」にエラーが
  出ていないか確認すると原因が分かりやすいです
- **ログインできない** → Authenticationの「Users」タブに、使おうとしているメールアドレスが
  登録されているか確認してください
- **画像の登録に失敗する** → `cloudinary-config.js` の cloud name・preset名が正しいか、
  presetの「Signing Mode」が「Unsigned」になっているかを確認してください。あわせて
  `firestore.rules` を正しく貼り付けて「公開」したか、ログインできているかも確認してください
