import { Redirect } from 'expo-router';

/** 想定外のdeep link(許可していないパス)は何も処理せずホームへ戻す。 */
export default function NotFound() {
  return <Redirect href="/" />;
}
