// Cloudinaryプロジェクトの接続情報（あなたのアカウントの値に書き換えてください）
//
// 取得方法:
//   1. https://cloudinary.com/ で無料アカウントを作成
//   2. ダッシュボード（https://console.cloudinary.com/）左上に表示される
//      「Cloud name」をコピーして cloudName に設定
//   3. 「Settings」（歯車アイコン）→「Upload」タブ →「Upload presets」→
//      「Add upload preset」で新しいpresetを作成
//        - Signing Mode: 「Unsigned」を選択
//      作成後に表示されるpreset名を uploadPreset に設定
//
// これらの値は「公開されても問題ない」設定情報です（秘密鍵ではありません）。
// ただし、Unsigned upload presetは名前さえ分かれば誰でもアップロードできる仕組みのため、
// 詳しくは README.md の「トラブルシューティング／注意事項」を参照してください。

export const cloudinaryConfig = {
  cloudName: "xdndqotb",
  uploadPreset: "illust_tager",
};
