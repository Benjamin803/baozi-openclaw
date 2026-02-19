import { EmbedBuilder, APIEmbedField, RestOrArray } from 'discord.js';

export class SafeEmbedBuilder extends EmbedBuilder {
  private _currentLength = 0;
  private _maxChars = 5900;
  private _truncated = false;

  constructor(data?: any) {
    super(data);
    this.updateLength();
  }

  private updateLength() {
    let len = 0;
    if (this.data.title) len += this.data.title.length;
    if (this.data.description) len += this.data.description.length;
    if (this.data.footer?.text) len += this.data.footer.text.length;
    if (this.data.author?.name) len += this.data.author.name.length;
    if (this.data.fields) {
      for (const field of this.data.fields) {
        len += field.name.length + field.value.length;
      }
    }
    this._currentLength = len;
  }

  public override addFields(...fields: RestOrArray<APIEmbedField>): this {
    if (this._truncated) return this;

    // Normalize fields to array
    const fieldsArray = Array.isArray(fields[0]) ? fields[0] : fields as APIEmbedField[];

    for (const field of fieldsArray) {
      // Check for max fields (25 limit in Discord)
      if (this.data.fields && this.data.fields.length >= 25) {
        this._truncated = true;
        this.addTruncationFooter();
        break;
      }

      const fieldLen = field.name.length + field.value.length;
      if (this._currentLength + fieldLen > this._maxChars) {
        this._truncated = true;
        this.addTruncationFooter();
        break;
      }
      super.addFields(field);
      this._currentLength += fieldLen;
    }
    return this;
  }

  private addTruncationFooter() {
    const currentFooter = this.data.footer?.text || '';
    if (!currentFooter.includes('... and more')) {
       this.setFooter({ text: currentFooter ? `${currentFooter} ... and more` : '... and more' });
    }
  }
  
  // Also override setTitle, setDescription etc to track length if needed, 
  // but usually fields are the dynamic part that causes overflow.
  // For simplicity, we assume title/desc are set before fields or are small.
}
