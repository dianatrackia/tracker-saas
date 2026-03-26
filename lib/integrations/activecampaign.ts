/**
 * ActiveCampaign integration.
 * - Verifies if an email exists as a contact (for lead verification).
 * - Optionally adds tags or triggers automations on events.
 */
import axios from 'axios';

interface ACConfig {
  api_url: string;    // e.g. https://youracccount.api-us1.com
  api_key: string;
}

interface ACContact {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export async function verifyLeadInAC(
  email: string,
  config: ACConfig
): Promise<{ verified: boolean; contact?: ACContact; error?: string }> {
  try {
    const res = await axios.get(
      `${config.api_url}/api/3/contacts`,
      {
        params: { email },
        headers: { 'Api-Token': config.api_key },
      }
    );

    const contacts = res.data?.contacts || [];
    if (contacts.length > 0) {
      return {
        verified: true,
        contact: {
          id: contacts[0].id,
          email: contacts[0].email,
          firstName: contacts[0].firstName,
          lastName: contacts[0].lastName,
        },
      };
    }

    return { verified: false };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { verified: false, error: error.message };
  }
}

export async function addTagToContact(
  email: string,
  tagName: string,
  config: ACConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get or create contact
    const contactRes = await axios.post(
      `${config.api_url}/api/3/contact/sync`,
      { contact: { email } },
      { headers: { 'Api-Token': config.api_key } }
    );
    const contactId = contactRes.data?.contact?.id;
    if (!contactId) return { success: false, error: 'No contact ID returned' };

    // 2. Find or create tag
    const tagRes = await axios.get(
      `${config.api_url}/api/3/tags`,
      {
        params: { search: tagName },
        headers: { 'Api-Token': config.api_key },
      }
    );
    let tagId = tagRes.data?.tags?.[0]?.id;

    if (!tagId) {
      const createTag = await axios.post(
        `${config.api_url}/api/3/tags`,
        { tag: { tag: tagName, tagType: 'contact' } },
        { headers: { 'Api-Token': config.api_key } }
      );
      tagId = createTag.data?.tag?.id;
    }

    // 3. Apply tag to contact
    await axios.post(
      `${config.api_url}/api/3/contactTags`,
      { contactTag: { contact: contactId, tag: tagId } },
      { headers: { 'Api-Token': config.api_key } }
    );

    return { success: true };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}

export async function testACConnection(
  config: ACConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    await axios.get(
      `${config.api_url}/api/3/users/me`,
      { headers: { 'Api-Token': config.api_key } }
    );
    return { success: true };
  } catch (err: unknown) {
    const error = err as { message?: string };
    return { success: false, error: error.message };
  }
}
