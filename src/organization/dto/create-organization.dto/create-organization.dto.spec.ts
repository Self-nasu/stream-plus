import { CreateOrganizationDto } from './create-organization.dto';

describe('CreateOrganizationDto', () => {
  it('should be defined', () => {
    expect(new CreateOrganizationDto()).toBeDefined();
  });
});
