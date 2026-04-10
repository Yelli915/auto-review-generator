import UploadStep from './steps/UploadStep'
import KeywordStep from './steps/KeywordStep'
import ReviewStep from './steps/ReviewStep'

export default function ReviewGenerator() {
  return (
    <div className="review-generator">
      <UploadStep />
      <KeywordStep />
      <ReviewStep />
    </div>
  )
}
