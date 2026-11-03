# DS AUTO 모의 롤플레이

Salesforce CBU AE 케이스 면접(DS AUTO) 연습용 정적 웹앱입니다. 발표 장표 설명 장면과 대표·COO 질문 장면 17개를 거쳐 100점 만점 점수와 합격 여부를 보여줍니다.

- 파일 하나(`index.html`)로 동작하며 빌드가 필요 없습니다.
- **답변 고르기** 모드는 어디서든 동작합니다.
- **직접 답하기 / 이어서 답하기(AI 평가)** 는 claude.ai Artifact 뷰어의 `sample` 기능을 사용합니다. Vercel 등 일반 호스팅에서는 해당 기능이 자동으로 숨겨지고 선택형으로만 진행됩니다.

## Vercel 배포

1. Vercel에서 이 저장소를 Import합니다.
2. **Root Directory**를 `apps/ds-auto-roleplay`로 지정합니다.
3. Framework Preset은 `Other`, Build Command와 Output Directory는 비워 둡니다.
4. Deploy합니다.

로컬 확인: `npx serve apps/ds-auto-roleplay` 또는 `index.html`을 브라우저로 열면 됩니다.
