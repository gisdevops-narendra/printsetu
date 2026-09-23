import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { StatusTagComponent } from './status-tag.component';

describe('StatusTagComponent', () => {
  function render(status: string) {
    const fixture = TestBed.createComponent(StatusTagComponent);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatusTagComponent] });
  });

  it('renders a friendly label for a known status', () => {
    const fixture = render('PRINTED');
    const tag = fixture.debugElement.query(By.css('p-tag'));
    expect(tag.componentInstance.value).toBe('Printed');
    expect(tag.componentInstance.severity).toBe('success');
  });

  it('reads Pending -> Printing -> Printed through a print, including after the file is cleaned up', () => {
    const label = (status: any) => render(status).debugElement.query(By.css('p-tag')).componentInstance.value;
    expect(label('QUEUED')).toBe('Pending');
    expect(label('PRINTING')).toBe('Printing');
    expect(label('PRINTED')).toBe('Printed');
    expect(label('RETENTION_PENDING')).toBe('Printed');
    expect(label('DELETED')).toBe('Printed');
  });

  it('maps a failure status to the danger severity', () => {
    const fixture = render('PRINT_FAILED');
    const tag = fixture.debugElement.query(By.css('p-tag'));
    expect(tag.componentInstance.value).toBe('Print Failed');
    expect(tag.componentInstance.severity).toBe('danger');
  });

  it('falls back to the raw status string (secondary severity) for an unrecognized status', () => {
    const fixture = render('SOME_FUTURE_STATUS' as any);
    const tag = fixture.debugElement.query(By.css('p-tag'));
    expect(tag.componentInstance.value).toBe('SOME_FUTURE_STATUS');
    expect(tag.componentInstance.severity).toBe('secondary');
  });
});
