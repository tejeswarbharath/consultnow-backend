const { triageProblem, generateMarketing } = require('./ai.service');
const aiService = require('./ai.service');

jest.mock('./ai.service');

describe('AI Service', () => {
  beforeEach(() => {
    // Clear all instances and calls to constructor and all methods:
    aiService.triageProblem.mockClear();
    aiService.generateMarketing.mockClear();
  });

  describe('triageProblem', () => {
    it('should return a category from the AI service', async () => {
      const mockResponse = 'Legal';
      aiService.triageProblem.mockResolvedValue(mockResponse);

      const problemDescription = 'I need help with a contract.';
      const result = await triageProblem(problemDescription);

      expect(result).toBe(mockResponse);
    });
  });

  describe('generateMarketing', () => {
    it('should return a marketing bio and snippet', async () => {
      const mockResponse = {
        bio: 'This is a bio.',
        marketingSnippet: 'This is a snippet.',
      };
      aiService.generateMarketing.mockResolvedValue(mockResponse);

      const skills = 'Some skills';
      const expertId = 'some-id';
      const result = await generateMarketing(skills, expertId);

      expect(result).toEqual(mockResponse);
    });
  });
});
