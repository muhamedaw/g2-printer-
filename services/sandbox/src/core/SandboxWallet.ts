export class SandboxWallet {
  private balance: number;
  private peak: number;

  constructor(startingCapital: number) {
    this.balance = startingCapital;
    this.peak = startingCapital;
  }

  getBalance(): number { return this.balance; }
  getPeak(): number { return this.peak; }

  debit(amount: number): boolean {
    if (amount > this.balance) return false;
    this.balance -= amount;
    return true;
  }

  credit(amount: number): void {
    this.balance += amount;
    if (this.balance > this.peak) this.peak = this.balance;
  }

  drawdown(): number {
    if (this.peak === 0) return 0;
    return ((this.peak - this.balance) / this.peak) * 100;
  }
}
