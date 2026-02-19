import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SafeEmbedBuilder } from '../src/utils/embed';

describe('SafeEmbedBuilder', () => {
  it('should truncate description if too long', () => {
    const longDesc = 'a'.repeat(3000);
    const embed = new SafeEmbedBuilder().setDescription(longDesc);
    // SafeEmbedBuilder truncates description > 2048 to 2045 + '...'
    const expected = 'a'.repeat(2045) + '...';
    assert.strictEqual(embed.data.description, expected);
    assert.ok(embed.length <= 5900);
  });

  it('should stop adding fields when size limit reached', () => {
    const embed = new SafeEmbedBuilder();
    // Add fields until close to limit
    // Each field ~200 chars. 30 fields = 6000 chars.
    for (let i = 0; i < 40; i++) {
      embed.addFields({ name: `Field ${i}`, value: 'x'.repeat(200) });
    }
    
    // Should stop before reaching 6000
    // 5900 limit
    // 25 field limit
    // So either size or count limit hits.
    // 25 fields * 200 = 5000 chars. So size limit NOT hit.
    // Count limit IS hit.
    assert.strictEqual(embed.data.fields?.length, 25);
    assert.ok(embed.data.footer?.text?.includes('... and more'));
  });

  it('should stop adding fields when size limit reached (short fields)', () => {
    const embed = new SafeEmbedBuilder();
    // Add fields until size limit reached with small fields
    // Not possible because count limit hits first (25 * small < 5900).
    // Unless we have huge title/description.
    
    embed.setDescription('a'.repeat(2000));
    // Now we have ~2000 chars.
    // Add fields of 200 chars.
    // Limit 5900 - 2000 = 3900.
    // 3900 / 200 = 19 fields.
    // So size limit should hit before 25 fields.
    
    for (let i = 0; i < 25; i++) {
      embed.addFields({ name: `Field ${i}`, value: 'x'.repeat(190) }); // name+value ~200
    }
    
    // 19 fields * 200 = 3800. + 2000 = 5800.
    // 20th field -> 6000. Exceeds.
    // So should have ~19 fields.
    assert.ok(embed.data.fields!.length < 25);
    assert.ok(embed.data.fields!.length >= 18);
    assert.ok(embed.data.footer?.text?.includes('... and more'));
  });
});
