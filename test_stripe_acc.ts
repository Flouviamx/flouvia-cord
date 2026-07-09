import { retrieveAccount } from './src/lib/billing';

async function run() {
  const account = await retrieveAccount('acct_1TqeotJ8FGVhSi7D');
  console.log(account.type);
}
run();
