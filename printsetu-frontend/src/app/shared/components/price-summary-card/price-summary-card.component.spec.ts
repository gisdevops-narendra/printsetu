import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PriceSummaryCardComponent } from './price-summary-card.component';

describe('PriceSummaryCardComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PriceSummaryCardComponent] });
  });

  it('renders every summary line label and value', () => {
    const fixture = TestBed.createComponent(PriceSummaryCardComponent);
    fixture.componentInstance.lines = [
      { label: 'Paper size', value: 'A4' },
      { label: 'Color mode', value: 'BW' },
    ];
    fixture.componentInstance.amount = '40.00';
    fixture.componentInstance.currency = 'INR';
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Paper size');
    expect(text).toContain('A4');
    expect(text).toContain('Color mode');
    expect(text).toContain('BW');
    expect(text).toContain('INR');
    expect(text).toContain('40.00');
  });

  it('defaults to zero amount / INR when nothing is bound', () => {
    const fixture = TestBed.createComponent(PriceSummaryCardComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('0.00');
    expect(text).toContain('INR');
    expect(
      fixture.debugElement.queryAll(By.css('.flex.justify-content-between.text-sm')).length,
    ).toBe(0);
  });
});
